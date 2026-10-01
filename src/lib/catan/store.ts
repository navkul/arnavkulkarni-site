import { LocalDatabase, PostgresDatabase, type Database } from './database.ts';
import {
  randomBytes,
  randomInt,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import { applyAction, RuleError, score, settlementSites, roadSites } from './engine.ts';
import { type Action, type Game, type PlayerMetrics, type VisualEvent } from './types.ts';
import { createGame } from './engine.ts';
import { beginOpening, rollOpening, recordVisuals, DICE_DURATION_MS } from './table-flow.ts';
import { testingAvailable, testControlsAvailable } from './testing-mode.ts';
import { recordCommandEvents } from './visual-events.ts';

const scrypt = promisify(scryptCallback);
export const secureRandom = () => randomInt(0, 0x100000000) / 0x100000000;
const token = () => randomBytes(32).toString('base64url');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export class ServiceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
function check(condition: unknown, message: string, status = 400): asserts condition {
  if (!condition) throw new ServiceError(message, status);
}
export type RoomCommand =
  | 'start'
  | 'roll-order'
  | 'pause'
  | 'approve-pause'
  | 'decline-pause'
  | 'resume'
  | 'leave'
  | 'action'
  | 'end-game';
export interface Identity {
  sessionHash: string;
  guestId: string;
  profileId?: string;
  name?: string;
  username?: string;
  avatarUrl?: string;
}
export interface ProfileSound {
  id: string;
  name: string;
  emoji: string;
  url: string;
}
export interface Seat {
  id: string;
  name: string;
  guestId: string;
  profileId?: string;
  color?: number;
  colorLocked?: boolean;
  simulated?: boolean;
  avatarUrl?: string;
  sounds?: ProfileSound[];
}
export interface Odds {
  revision: number;
  probabilities: number[];
  delta: number[];
  samples: number;
  completed: number;
  model: string;
}
export interface Room {
  code: string;
  name: string;
  capacity: 3 | 4 | 5 | 6;
  hosting?: 'server' | 'local';
  winProbability?: boolean;
  testing?: boolean;
  practice?: boolean;
  testPlayer?: number;
  host: string;
  seats: Seat[];
  status: 'lobby' | 'starting' | 'playing' | 'paused' | 'finished' | 'ended';
  revision: number;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  finishedAt?: number;
  game?: Game;
  odds?: Odds;
  opening?: {
    revealAt: number;
    readyAt: number;
    round: number;
    contenders: string[];
    rolls: { playerId: string; values: [number, number]; round: number }[];
    winner?: string;
  };
  diceEvent?: { id: string; playerId: string; color: number; values: [number, number]; at: number };
  awardEvents?: { id: string; kind: 'longestRoad' | 'largestArmy'; playerId: string; at: number }[];
  pauseRequest?: { id: string; by: string; votes: string[] };
  visualEvents?: VisualEvent[];
  soundEvents?: (ProfileSound & { at: number; playerId: string; soundId: string })[];
}
interface ProfileRow {
  id: string;
  name: string;
  password: string;
}
interface ResultRow {
  room: string;
  seat: string;
  profile: string | null;
  guest: string;
  points: number;
  won: number;
  players: number;
  turns: number;
  finished: number;
  metrics: string;
}
export function owns(identity: Identity, seat: Seat) {
  return seat.profileId ? identity.profileId === seat.profileId : identity.guestId === seat.guestId;
}
/** The real host owns the sandbox; only its selected test hand changes. */
export function controlledSeat(room: Room, identity: Identity) {
  const owner = room.seats.find((s) => owns(identity, s));
  if (testControlsAvailable(room) && owner?.id === room.host) {
    const selected = room.seats[room.testPlayer ?? 0];
    return selected && (selected.id === room.host || selected.simulated) ? selected : owner;
  }
  return owner;
}
export async function passwordHash(password: string): Promise<string> {
  check(
    typeof password === 'string' && password.length >= 10 && password.length <= 128,
    'Use a password of 10–128 characters.',
  );
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString('hex')}`;
}
async function passwordMatches(password: string, encoded: string) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const [salt, stored] = encoded.split(':');
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(stored, 'hex');
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}
export function cleanName(name: unknown) {
  check(typeof name === 'string', 'Enter a name.');
  const normalized = name.trim();
  check(
    /^[\p{L}\p{N} _.-]{2,24}$/u.test(normalized),
    'Use 2–24 letters, numbers, spaces, dots, dashes or underscores.',
  );
  return normalized;
}
export class CatanStore {
  private readonly database: Database;
  readonly hosting: 'server' | 'local';
  constructor(url: string, hosting: 'server' | 'local' = 'server') {
    this.hosting = hosting;
    this.database = hosting === 'local' ? new LocalDatabase(url) : new PostgresDatabase(url);
  }
  async close() {
    await this.database.close();
  }
  async query(sql: string, ...params: (string | number | null)[]) {
    return this.database.query(sql, params);
  }
  private async get<T>(sql: string, ...params: (string | number | null)[]): Promise<T | undefined> {
    return (await this.query(sql, ...params))[0] as T | undefined;
  }
  private async all<T>(sql: string, ...params: (string | number | null)[]): Promise<T[]> {
    return (await this.query(sql, ...params)) as T[];
  }
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.database.transaction(fn);
  }
  async rateLimit(key: string, maximum: number, window = 60_000) {
    return this.transaction(async () => {
      const now = Date.now();
      const row = await this.get<{ start: number; count: number }>(
        'SELECT start,count FROM limits WHERE key=?',
        key,
      );
      check(
        !row || row.start + window <= now || row.count < maximum,
        'Too many requests. Please wait and try again.',
        429,
      );
      if (!row || row.start + window <= now)
        await this.query(
          'INSERT INTO limits VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET start=EXCLUDED.start,count=1',
          key,
          now,
        );
      else await this.query('UPDATE limits SET count=count+1 WHERE key=?', key);
      await this.query('DELETE FROM limits WHERE start<?', now - 86400_000);
    });
  }
  async session(secret?: string): Promise<{ identity: Identity; secret?: string }> {
    if (secret && secret.length <= 128) {
      const row = await this.get<{
        guest: string;
        profile: string | null;
        name: string | null;
        username: string | null;
        avatar: string | null;
      }>(
        `SELECT s.guest,s.profile,COALESCE(f.display_name,p.name) name,p.name username,f.avatar FROM sessions s LEFT JOIN profiles p ON s.profile=p.id LEFT JOIN profile_preferences f ON f.profile=p.id WHERE s.hash=? AND s.expires>?`,
        hash(secret),
        Date.now(),
      );
      if (row)
        return {
          identity: {
            sessionHash: hash(secret),
            guestId: row.guest,
            profileId: row.profile ?? undefined,
            name: row.name ?? undefined,
            username: row.username ?? undefined,
            avatarUrl: row.avatar ? this.mediaUrl(row.avatar) : undefined,
          },
        };
    }
    const fresh = token();
    const guest = token();
    await this.query(
      'INSERT INTO sessions VALUES(?,?,NULL,?)',
      hash(fresh),
      guest,
      Date.now() + 30 * 86400_000,
    );
    await this.query('DELETE FROM sessions WHERE expires<?', Date.now());
    return { identity: { sessionHash: hash(fresh), guestId: guest }, secret: fresh };
  }
  private async rotate(identity: Identity, profileId?: string) {
    const secret = token();
    await this.query('DELETE FROM sessions WHERE hash=?', identity.sessionHash);
    await this.query(
      'INSERT INTO sessions VALUES(?,?,?,?)',
      hash(secret),
      identity.guestId,
      profileId ?? null,
      Date.now() + 30 * 86400_000,
    );
    return secret;
  }
  async canRegister(identity: Identity) {
    return !identity.profileId;
  }
  async register(identity: Identity, name: unknown, password: string) {
    check(!identity.profileId, 'You are already signed in.');
    const cleaned = cleanName(name);
    await this.rateLimit(`register:${identity.guestId}`, 5, 3600_000);
    const encoded = await passwordHash(password);
    return this.transaction(async () => {
      check(
        await this.canRegister(identity),
        'Your completed games have already been claimed.',
        409,
      );
      check(
        !(await this.get('SELECT 1 FROM profiles WHERE name_key=?', cleaned.toLowerCase())),
        'That profile name is already taken.',
        409,
      );
      const id = token();
      await this.query(
        'INSERT INTO profiles VALUES(?,?,?,?,?)',
        id,
        cleaned,
        cleaned.toLowerCase(),
        encoded,
        Date.now(),
      );
      await this.query(
        'UPDATE results SET profile=? WHERE guest=? AND profile IS NULL',
        id,
        identity.guestId,
      );
      for (const room of await this.rooms()) {
        let changed = false;
        room.seats.forEach((seat) => {
          if (!seat.profileId && seat.guestId === identity.guestId) {
            seat.profileId = id;
            seat.name = cleaned;
            changed = true;
            const player = room.game?.players.find((p) => p.id === seat.id);
            if (player) {
              player.profileId = id;
              player.name = cleaned;
            }
          }
        });
        if (changed) {
          room.revision++;
          await this.save(room);
        }
      }
      return await this.rotate(identity, id);
    });
  }
  async login(identity: Identity, name: unknown, password: string) {
    const cleaned = cleanName(name);
    await this.rateLimit(`login:${cleaned.toLowerCase()}`, 10, 15 * 60_000);
    const profile = await this.get<ProfileRow>(
      'SELECT * FROM profiles WHERE name_key=?',
      cleaned.toLowerCase(),
    );
    // Perform the same expensive operation for unknown names.
    const valid = await passwordMatches(
      password,
      profile?.password ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`,
    );
    check(profile && valid, 'Incorrect name or password.', 401);
    return this.transaction(async () => await this.rotate(identity, profile.id));
  }
  logout(identity: Identity) {
    return this.transaction(async () => await this.rotate(identity));
  }
  async room(code: string): Promise<Room> {
    check(typeof code === 'string' && /^[A-Z2-9]{6}$/.test(code), 'Invalid room code.', 404);
    const row = await this.get<{ state: string }>('SELECT state FROM rooms WHERE code=?', code);
    check(row, 'Room not found.', 404);
    return JSON.parse(row.state) as Room;
  }
  async rooms(): Promise<Room[]> {
    return (await this.all<{ state: string }>('SELECT state FROM rooms')).map((row) =>
      JSON.parse(row.state),
    );
  }
  private async save(room: Room) {
    room.updatedAt = Date.now();
    await this.query(
      'INSERT INTO rooms VALUES(?,?) ON CONFLICT(code) DO UPDATE SET state=EXCLUDED.state',
      room.code,
      JSON.stringify(room),
    );
    if (
      room.game &&
      ['playing', 'paused', 'finished'].includes(room.status) &&
      room.winProbability !== false
    )
      await this.query(
        'INSERT INTO jobs(room,revision,snapshot) VALUES(?,?,?) ON CONFLICT(room,revision) DO NOTHING',
        room.code,
        room.revision,
        JSON.stringify(room.game),
      );
  }
  async createRoom(
    identity: Identity,
    name: unknown,
    capacity: number,
    guestName: unknown,
    winProbability = true,
  ): Promise<Room> {
    check(
      capacity === 3 || capacity === 4 || capacity === 5 || capacity === 6,
      'Choose 3–6 players.',
    );
    check(typeof winProbability === 'boolean', 'Invalid probability setting.');
    const title = cleanName(name);
    const playerName = identity.name ?? cleanName(guestName);
    await this.rateLimit(`create:${identity.guestId}`, 10, 3600_000);
    return this.transaction(async () => {
      check(
        (await this.rooms()).filter(
          (r) =>
            !['finished', 'ended'].includes(r.status) && r.seats.some((s) => owns(identity, s)),
        ).length < 10,
        'You already have ten open rooms.',
      );
      let code: string;
      do {
        code = Array.from(
          { length: 6 },
          () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(32)],
        ).join('');
      } while (await this.get('SELECT 1 FROM rooms WHERE code=?', code));
      const seat = {
        id: token(),
        name: playerName,
        color: 0,
        guestId: identity.guestId,
        profileId: identity.profileId,
        avatarUrl: identity.avatarUrl,
        sounds: identity.profileId ? await this.sounds(identity.profileId, true) : [],
      };
      const room: Room = {
        code,
        name: title,
        capacity,
        hosting: this.hosting,
        winProbability,
        host: seat.id,
        seats: [seat],
        status: 'lobby',
        revision: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await this.save(room);
      return room;
    });
  }
  async createTestRoom(
    identity: Identity,
    name: unknown,
    capacity: number,
    guestName: unknown,
  ): Promise<Room> {
    check(
      testingAvailable() && this.hosting === 'local',
      'Testing mode is available only in local development.',
      403,
    );
    return this.transaction(async () => {
      const existing = (await this.rooms()).find((r) => r.testing && !r.practice);
      if (existing) {
        check(
          existing.seats.some((s) => s.id === existing.host && owns(identity, s)),
          `Test table ${existing.code} already exists. Its host must delete it before creating another.`,
          409,
        );
        return existing;
      }
      const room = await this.createRoom(identity, name, capacity, guestName, false);
      room.testing = true;
      room.testPlayer = 0;
      await this.save(room);
      return room;
    });
  }
  private checkTestHost(room: Room, identity: Identity, revision: number) {
    check(
      testControlsAvailable(room),
      'Testing mode is available only in local development or a practice table.',
      403,
    );
    check(
      room.testing && room.seats.some((s) => s.id === room.host && owns(identity, s)),
      'Only the test host can control these seats.',
      403,
    );
    check(revision === room.revision, 'The game changed. Try again.', 409);
  }
  /** TESTING is an entry code, not shared mutable state: each tester owns one durable sandbox. */
  async openPracticeRoom(identity: Identity): Promise<Room> {
    check(this.hosting === 'server', 'Practice tables use the online server.', 400);
    return this.transaction(async () => {
      const existing = (await this.rooms()).find(
        (room) =>
          room.practice && room.seats.some((seat) => seat.id === room.host && owns(identity, seat)),
      );
      if (existing) return existing;
      let room = await this.createRoom(identity, 'Practice table', 4, 'You', false);
      room.testing = true;
      room.practice = true;
      room.testPlayer = 0;
      await this.save(room);
      for (let index = 1; index < 4; index++)
        room = await this.addTestPlayer(identity, room.code, room.revision);
      room.seats.forEach((seat) => {
        seat.colorLocked = true;
      });
      // Legal snake placement gives a playable board immediately, with normal starting resources.
      room.game = createGame(room.seats, secureRandom);
      while (room.game.phase.startsWith('setup')) {
        const game = room.game;
        const action: Action =
          game.phase === 'setup-settlement'
            ? { type: 'settlement', vertex: settlementSites(game, game.active, true)[0] }
            : { type: 'road', edge: roadSites(game, game.active, game.setupVertex)[0] };
        room.game = applyAction(game, game.active, action, secureRandom);
      }
      room.status = 'playing';
      room.startedAt = Date.now();
      this.followTestTurn(room);
      room.revision++;
      await this.save(room);
      return room;
    });
  }
  async resetPracticeRoom(identity: Identity, code: string, revision: number) {
    return this.transaction(async () => {
      const previous = await this.room(code);
      this.checkTestHost(previous, identity, revision);
      check(previous.practice, 'Only practice tables can restart setup.', 403);
      const host = previous.seats.find((seat) => seat.id === previous.host)!;
      const room: Room = {
        code,
        name: previous.name,
        capacity: 3,
        hosting: 'server',
        winProbability: false,
        testing: true,
        practice: true,
        testPlayer: 0,
        host: host.id,
        seats: [{ ...host, colorLocked: false }],
        status: 'lobby',
        revision: previous.revision + 1,
        createdAt: previous.createdAt,
        updatedAt: Date.now(),
      };
      await this.save(room);
      return room;
    });
  }
  async addTestPlayer(identity: Identity, code: string, revision: number) {
    return this.transaction(async () => {
      const room = await this.room(code);
      this.checkTestHost(room, identity, revision);
      check(room.status === 'lobby', 'Add players before starting the game.');
      check(room.seats.length < 6, 'The table already has six players.');
      let number = room.seats.length + 1;
      while (room.seats.some((s) => s.name.toLowerCase() === `test player ${number}`)) number++;
      room.seats.push({
        id: token(),
        guestId: token(),
        name: `Test player ${number}`,
        color: [0, 1, 2, 3, 4, 5].find((c) => !room.seats.some((s, i) => (s.color ?? i) === c)),
        simulated: true,
      });
      room.capacity = Math.max(room.capacity, room.seats.length) as Room['capacity'];
      room.testPlayer = room.seats.length - 1;
      room.revision++;
      await this.save(room);
      return room;
    });
  }
  async deleteTestRoom(identity: Identity, code: string, revision: number) {
    return this.transaction(async () => {
      const room = await this.room(code);
      this.checkTestHost(room, identity, revision);
      for (const table of ['jobs', 'odds_history', 'results'])
        await this.query(`DELETE FROM ${table} WHERE room=?`, code);
      await this.query('DELETE FROM rooms WHERE code=?', code);
    });
  }
  private followTestTurn(room: Room) {
    if (!room.testing || !room.game) return;
    const nextId =
      room.status === 'starting'
        ? room.opening!.contenders.find(
            (id) =>
              !room.opening!.rolls.some(
                (r) => r.round === room.opening!.round && r.playerId === id,
              ),
          )
        : room.game.players[
            room.game.phase === 'discard'
              ? Number(Object.keys(room.game.discard)[0])
              : room.game.active
          ]?.id;
    const next = room.seats.findIndex(
      (s) => s.id === nextId && (s.simulated || s.id === room.host),
    );
    room.testPlayer = next >= 0 ? next : room.seats.findIndex((s) => s.id === room.host);
  }
  async selectTestPlayer(identity: Identity, code: string, revision: number, player: unknown) {
    return this.transaction(async () => {
      const room = await this.room(code);
      this.checkTestHost(room, identity, revision);
      check(
        Number.isInteger(player) && Number(player) >= 0 && Number(player) < room.seats.length,
        'Choose a test player.',
      );
      const selected = room.seats[Number(player)];
      check(
        selected.simulated || selected.id === room.host,
        'This player controls their own seat.',
        403,
      );
      room.testPlayer = Number(player);
      room.revision++;
      await this.save(room);
      return room;
    });
  }
  async join(identity: Identity, code: string, name: unknown): Promise<Room> {
    return this.transaction(async () => {
      const room = await this.room(code);
      if (room.seats.some((s) => owns(identity, s))) return room;
      check(!room.practice, 'Enter TESTING to open your own practice table.', 403);
      check(room.status === 'lobby', 'This game has already started.');
      check(room.seats.length < room.capacity, 'This room is full.');
      const cleaned = identity.name ?? cleanName(name);
      check(
        !room.seats.some((s) => s.name.toLowerCase() === cleaned.toLowerCase()),
        'Choose a different display name for this room.',
      );
      room.seats.push({
        id: token(),
        name: cleaned,
        color: [0, 1, 2, 3, 4, 5].find((c) => !room.seats.some((s, i) => (s.color ?? i) === c)),
        guestId: identity.guestId,
        profileId: identity.profileId,
        avatarUrl: identity.avatarUrl,
        sounds: identity.profileId ? await this.sounds(identity.profileId, true) : [],
      });
      room.revision++;
      await this.save(room);
      return room;
    });
  }
  async chooseColor(
    identity: Identity,
    code: string,
    revision: number,
    color: unknown,
    locked: unknown,
  ) {
    return this.transaction(async () => {
      const room = await this.room(code);
      const seat = controlledSeat(room, identity);
      check(seat && room.status === 'lobby', 'Choose your color before the game starts.', 403);
      check(revision === room.revision, 'The lobby changed. Try again.', 409);
      check(
        Number.isInteger(color) &&
          Number(color) >= 0 &&
          Number(color) < 6 &&
          typeof locked === 'boolean',
        'Choose a color.',
      );
      check(
        !seat.colorLocked || color === (seat.color ?? room.seats.indexOf(seat)),
        'Unlock your color first.',
      );
      check(
        !room.seats.some((s, i) => s.id !== seat.id && (s.color ?? i) === color),
        'That color is taken.',
      );
      seat.color = Number(color);
      seat.colorLocked = locked;
      room.revision++;
      await this.save(room);
      return room;
    });
  }
  async change(
    identity: Identity,
    code: string,
    revision: number,
    command: RoomCommand,
    action?: Action,
    pauseRequestId?: unknown,
  ): Promise<Room | undefined> {
    return this.transaction(async () => {
      const room = await this.room(code);
      const seat = room.seats.find((s) => owns(identity, s));
      check(seat, 'You do not have a seat in this room.', 403);
      check(
        (Number.isSafeInteger(revision) &&
          revision === room.revision &&
          (pauseRequestId === undefined || pauseRequestId === room.pauseRequest?.id)) ||
          (['approve-pause', 'decline-pause'].includes(command) &&
            typeof pauseRequestId === 'string' &&
            pauseRequestId === room.pauseRequest?.id),
        'The game changed. Review the latest board and try again.',
        409,
      );
      check(
        !room.testing || testControlsAvailable(room),
        'Test games require local development or a practice table.',
        403,
      );
      const previousStatus = room.status;
      const visualActorId = controlledSeat(room, identity)!.id;
      if (command === 'start') {
        check(
          seat.id === room.host && room.status === 'lobby',
          'Only the host can start the lobby.',
          403,
        );
        check(
          room.seats.length >= (room.capacity >= 5 ? 5 : 3),
          room.capacity >= 5
            ? 'The extended board needs 5–6 players.'
            : 'The base board needs 3–4 players.',
        );
        room.seats.forEach((s, i) => {
          s.color ??= i;
          s.colorLocked = true;
        });
        room.game = createGame(
          room.seats.map((s) => ({
            id: s.id,
            name: s.name,
            profileId: s.profileId,
            color: s.color,
          })),
          secureRandom,
        );
        room.startedAt = Date.now();
        beginOpening(room, Date.now());
        this.followTestTurn(room);
      } else if (command === 'roll-order') {
        rollOpening(room, controlledSeat(room, identity)!.id, secureRandom, Date.now());
        this.followTestTurn(room);
      } else if (command === 'pause') {
        check(room.status === 'playing' && !room.pauseRequest, 'A pause cannot be requested now.');
        const voter = controlledSeat(room, identity)!;
        room.pauseRequest = { id: token(), by: voter.id, votes: [voter.id] };
      } else if (command === 'approve-pause' || command === 'decline-pause') {
        check(room.status === 'playing' && room.pauseRequest, 'There is no pause request.');
        const voter = controlledSeat(room, identity)!;
        if (command === 'decline-pause') room.pauseRequest = undefined;
        else {
          check(!room.pauseRequest.votes.includes(voter.id), 'You have already agreed.');
          room.pauseRequest.votes.push(voter.id);
          if (room.seats.every((s) => room.pauseRequest!.votes.includes(s.id))) {
            room.status = 'paused';
            room.pauseRequest = undefined;
          }
        }
      } else if (command === 'resume') {
        check(room.status === 'paused', 'This game is not paused.');
        room.status = 'playing';
      } else if (command === 'end-game') {
        check(seat.id === room.host, 'Only the host can end the game.', 403);
        check(
          room.game && ['starting', 'playing', 'paused'].includes(room.status),
          'This game is already closed.',
        );
        room.status = 'ended';
        room.pauseRequest = undefined;
        room.finishedAt = Date.now();
        room.game.offer = undefined;
        room.game.log.push({
          turn: room.game.turn,
          text: `${seat.name} ended the game early. No results were recorded.`,
        });
      } else if (command === 'leave') {
        check(room.status === 'lobby', 'You can only leave before the game starts.');
        check(!room.testing || seat.id !== room.host, 'Use Delete test table to close this table.');
        const selectedId = room.seats[room.testPlayer ?? 0]?.id;
        room.seats = room.seats.filter((s) => s.id !== seat.id);
        if (room.testing)
          room.testPlayer = Math.max(
            0,
            room.seats.findIndex((s) => s.id === selectedId),
          );
        if (!room.seats.length) {
          await this.query('DELETE FROM rooms WHERE code=?', code);
          return undefined;
        }
        if (room.host === seat.id) room.host = room.seats[0].id;
      } else if (command === 'action') {
        check(room.status === 'playing' && room.game && action, 'This game is not active.');
        check(
          !room.opening || Date.now() >= room.opening.readyAt,
          'Wait for the opening dice to settle.',
        );
        if (action.type === 'roll' && room.diceEvent)
          check(
            Date.now() >= room.diceEvent.at + DICE_DURATION_MS,
            'Wait for the previous dice to settle.',
          );
        const actor = controlledSeat(room, identity)!;
        const player = room.game.players.findIndex((p) => p.id === actor.id);
        try {
          const before = room.game;
          room.game = applyAction(room.game, player, action, secureRandom);
          recordVisuals(room, before, actor.id, action, Date.now());
          this.followTestTurn(room);
        } catch (error) {
          if (error instanceof RuleError) throw new ServiceError(error.message);
          throw error;
        }
        if (room.game.winner !== undefined) {
          room.status = 'finished';
          room.pauseRequest = undefined;
          room.finishedAt = Date.now();
          await this.recordResults(room);
        }
      } else throw new ServiceError('Unknown room command.');
      recordCommandEvents(room, previousStatus, visualActorId, command, Date.now());
      room.revision++;
      await this.save(room);
      return room;
    });
  }
  private async recordResults(room: Room) {
    if (room.testing || this.hosting === 'local' || room.hosting === 'local') return;
    const game = room.game!;
    for (const [i, p] of game.players.entries()) {
      const seat = room.seats.find((s) => s.id === p.id)!;
      await this.query(
        'INSERT INTO results VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(room,seat) DO NOTHING',
        room.code,
        seat.id,
        seat.profileId ?? null,
        seat.guestId,
        score(game, i),
        Number(game.winner === i),
        game.players.length,
        game.turn,
        room.finishedAt!,
        JSON.stringify(p.metrics),
      );
    }
  }
  async pendingJobs(code?: string) {
    return this.transaction(async () => {
      const now = Date.now();
      const jobs = await this.all<{ room: string; revision: number }>(
        `SELECT room,revision FROM jobs WHERE completed=FALSE AND published<? ${code ? 'AND room=?' : ''} ORDER BY revision LIMIT 20`,
        now - 600_000,
        ...(code ? [code] : []),
      );
      for (const job of jobs)
        await this.query(
          'UPDATE jobs SET published=? WHERE room=? AND revision=?',
          now,
          job.room,
          job.revision,
        );
      return jobs;
    });
  }
  async retryJob(code: string, revision: number) {
    await this.query(
      'UPDATE jobs SET published=0 WHERE room=? AND revision=? AND completed=FALSE',
      code,
      revision,
    );
  }
  async job(code: string, revision: number): Promise<Game | undefined> {
    const row = await this.get<{ snapshot: string }>(
      'SELECT snapshot FROM jobs WHERE room=? AND revision=? AND completed=FALSE',
      code,
      revision,
    );
    return row ? (JSON.parse(row.snapshot) as Game) : undefined;
  }
  async saveOdds(code: string, odds: Odds) {
    return this.transaction(async () => {
      if (
        await this.get(
          'SELECT 1 FROM odds_history WHERE room=? AND revision=?',
          code,
          odds.revision,
        )
      )
        return;
      const room = await this.room(code);
      const prior = await this.get<{ data: string }>(
        'SELECT data FROM odds_history WHERE room=? AND revision<? ORDER BY revision DESC LIMIT 1',
        code,
        odds.revision,
      );
      const previous = prior ? (JSON.parse(prior.data) as Odds) : undefined;
      odds = {
        ...odds,
        delta: odds.probabilities.map((p, i) => p - (previous?.probabilities[i] ?? p)),
      };
      await this.query(
        'INSERT INTO odds_history VALUES(?,?,?)',
        code,
        odds.revision,
        JSON.stringify(odds),
      );
      // Queue delivery may be out of order. Repair the following estimate's delta as well.
      const next = await this.get<{ data: string }>(
        'SELECT data FROM odds_history WHERE room=? AND revision>? ORDER BY revision LIMIT 1',
        code,
        odds.revision,
      );
      if (next) {
        const following = JSON.parse(next.data) as Odds;
        following.delta = following.probabilities.map((p, i) => p - odds.probabilities[i]);
        await this.query(
          'UPDATE odds_history SET data=? WHERE room=? AND revision=?',
          JSON.stringify(following),
          code,
          following.revision,
        );
        if (room.odds?.revision === following.revision) room.odds = following;
      }
      if (!room.odds || odds.revision > room.odds.revision) room.odds = odds;
      await this.save(room);
      // Keep completion receipts for deduplication; discard bulky snapshots once evaluated.
      await this.query(
        "UPDATE jobs SET completed=TRUE,snapshot='' WHERE room=? AND revision=?",
        code,
        odds.revision,
      );
    });
  }
  async oddsHistory(code: string): Promise<Odds[]> {
    return (
      await this.all<{ data: string }>(
        'SELECT data FROM odds_history WHERE room=? ORDER BY revision DESC LIMIT 100',
        code,
      )
    )
      .reverse()
      .map((r) => JSON.parse(r.data));
  }
  private mediaUrl(id: string) {
    return `/api/catan/media?id=${id}${this.hosting === 'local' ? '&hosting=local' : ''}`;
  }
  private async sounds(profileId: string, activeOnly = false) {
    const rows = await this.all<{ id: string; name: string; emoji: string; active: number }>(
      `SELECT id,name,emoji,active FROM profile_media WHERE profile=? AND kind='sound'${activeOnly ? ' AND active=1' : ''} ORDER BY created`,
      profileId,
    );
    return rows.map((row) => ({ ...row, active: !!row.active, url: this.mediaUrl(row.id) }));
  }
  private requireProfile(identity: Identity) {
    check(identity.profileId, 'Sign in to update your profile.', 401);
    return identity.profileId;
  }
  private async syncProfile(profileId: string) {
    const row = await this.get<{ name: string; avatar: string | null }>(
      'SELECT COALESCE(f.display_name,p.name) name,f.avatar FROM profiles p LEFT JOIN profile_preferences f ON f.profile=p.id WHERE p.id=?',
      profileId,
    );
    if (!row) return;
    const sounds = await this.sounds(profileId, true);
    for (const room of await this.rooms()) {
      if (!room.seats.some((seat) => seat.profileId === profileId)) continue;
      for (const seat of room.seats.filter((seat) => seat.profileId === profileId)) {
        seat.name = row.name;
        seat.avatarUrl = row.avatar ? this.mediaUrl(row.avatar) : undefined;
        seat.sounds = sounds;
        const player = room.game?.players.find((player) => player.id === seat.id);
        if (player) player.name = row.name;
      }
      room.revision++;
      await this.save(room);
    }
  }
  async updateProfile(identity: Identity, displayName: unknown) {
    const profileId = this.requireProfile(identity);
    const name = cleanName(displayName);
    return this.transaction(async () => {
      // Room names must remain distinguishable when changing a display name mid-game.
      check(
        !(await this.rooms()).some(
          (room) =>
            !['finished', 'ended'].includes(room.status) &&
            room.seats.some((seat) => seat.profileId === profileId) &&
            room.seats.some(
              (seat) =>
                seat.profileId !== profileId && seat.name.toLowerCase() === name.toLowerCase(),
            ),
        ),
        'Another player at your table already uses that name.',
      );
      await this.query(
        'INSERT INTO profile_preferences(profile,display_name) VALUES(?,?) ON CONFLICT(profile) DO UPDATE SET display_name=EXCLUDED.display_name',
        profileId,
        name,
      );
      await this.syncProfile(profileId);
    });
  }
  async saveMedia(
    identity: Identity,
    kind: 'avatar' | 'sound',
    mime: string,
    data: Buffer,
    name: unknown,
    emoji: unknown,
  ) {
    const profileId = this.requireProfile(identity);
    check(
      data.length > 0 && data.length <= 262144,
      'Keep this recording or image below 256 KB.',
      413,
    );
    const type = mime.split(';')[0].trim().toLowerCase();
    const imageValid =
      (type === 'image/png' &&
        data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
      (type === 'image/jpeg' && data[0] === 255 && data[1] === 216 && data[2] === 255) ||
      (type === 'image/webp' &&
        data.toString('ascii', 0, 4) === 'RIFF' &&
        data.toString('ascii', 8, 12) === 'WEBP');
    const soundValid =
      (type === 'audio/webm' && data.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]))) ||
      (type === 'audio/ogg' && data.toString('ascii', 0, 4) === 'OggS') ||
      (type === 'audio/mp4' && data.toString('ascii', 4, 8) === 'ftyp');
    check(
      kind === 'avatar' ? imageValid : soundValid,
      kind === 'avatar'
        ? 'Choose a JPEG, PNG or WebP picture.'
        : 'This recording format is not supported.',
    );
    const title = kind === 'sound' ? cleanName(name) : 'Profile picture';
    const icon =
      typeof emoji === 'string' && ['🎉', '🐑', '⚓', '😈', '🎲', '👏', '😂', '💬'].includes(emoji)
        ? emoji
        : '💬';
    await this.rateLimit(`media:${profileId}`, 30, 3600_000);
    return this.transaction(async () => {
      const existing = await this.sounds(profileId);
      if (kind === 'sound')
        check(existing.length < 10, 'You can save up to 10 sounds. Delete one to record another.');
      const id = token();
      await this.query(
        'INSERT INTO profile_media(id,profile,kind,mime,data,name,emoji,active,created) VALUES(?,?,?,?,?,?,?,?,?)',
        id,
        profileId,
        kind,
        type,
        data.toString('base64'),
        title,
        icon,
        kind === 'sound' && existing.filter((sound) => sound.active).length < 3 ? 1 : 0,
        Date.now(),
      );
      if (kind === 'avatar') {
        await this.query(
          'INSERT INTO profile_preferences(profile,display_name,avatar) VALUES(?,?,?) ON CONFLICT(profile) DO UPDATE SET avatar=EXCLUDED.avatar',
          profileId,
          identity.name ?? identity.username!,
          id,
        );
        await this.query(
          "DELETE FROM profile_media WHERE profile=? AND kind='avatar' AND id<>?",
          profileId,
          id,
        );
      }
      await this.syncProfile(profileId);
      return { id, url: this.mediaUrl(id) };
    });
  }
  async updateSound(identity: Identity, id: unknown, active: unknown, remove = false) {
    const profileId = this.requireProfile(identity);
    check(typeof id === 'string', 'Choose a sound.');
    return this.transaction(async () => {
      const sounds = await this.sounds(profileId);
      const sound = sounds.find((sound) => sound.id === id);
      check(sound, 'Sound not found.', 404);
      if (remove)
        await this.query('DELETE FROM profile_media WHERE id=? AND profile=?', id, profileId);
      else {
        check(typeof active === 'boolean', 'Choose whether this sound is active.');
        check(
          !active || sound.active || sounds.filter((sound) => sound.active).length < 3,
          'Only 3 sounds can be active. Turn one off first.',
        );
        await this.query(
          'UPDATE profile_media SET active=? WHERE id=? AND profile=?',
          active ? 1 : 0,
          id,
          profileId,
        );
      }
      await this.syncProfile(profileId);
    });
  }
  async media(identity: Identity, id: string) {
    check(/^[\w-]{43}$/.test(id), 'Media not found.', 404);
    const row = await this.get<{ profile: string; kind: string; mime: string; data: string }>(
      'SELECT profile,kind,mime,data FROM profile_media WHERE id=?',
      id,
    );
    check(row, 'Media not found.', 404);
    if (row.kind === 'sound' && identity.profileId !== row.profile) {
      const rooms = await this.rooms();
      check(
        rooms.some(
          (room) =>
            room.seats.some((seat) => owns(identity, seat)) &&
            room.seats.some((seat) => seat.profileId === row.profile),
        ),
        'This sound belongs to another table.',
        403,
      );
    }
    return { mime: row.mime, data: Buffer.from(row.data, 'base64') };
  }
  async playSound(identity: Identity, code: string, soundId: unknown) {
    const profileId = this.requireProfile(identity);
    check(typeof soundId === 'string', 'Choose a sound.');
    return this.transaction(async () => {
      const room = await this.room(code);
      const seat = room.seats.find((seat) => owns(identity, seat));
      check(
        seat && (!room.testing || controlledSeat(room, identity)?.id === seat.id),
        'Only your own seat can play your sounds.',
        403,
      );
      check(
        ['lobby', 'starting', 'playing', 'paused'].includes(room.status),
        'This table has ended.',
      );
      const sound = (await this.sounds(profileId, true)).find((sound) => sound.id === soundId);
      check(sound, 'Choose one of your active sounds.', 404);
      await this.rateLimit(`sound:${profileId}`, 1, 6000);
      const now = Date.now();
      room.soundEvents = [
        ...(room.soundEvents ?? []).filter((event) => event.at > now - 15000),
        { ...sound, id: token(), soundId: sound.id, playerId: seat.id, at: now },
      ].slice(-12);
      // Sound reactions never change the game revision or cancel a player's unfinished move.
      await this.save(room);
    });
  }
  async leaderboard() {
    const rows = await this.all<{
      name: string;
      games: number;
      wins: number;
      points: number;
      averagePoints: number;
      winRate: number;
    }>(
      `SELECT COALESCE(f.display_name,p.name) name,COUNT(*) games,SUM(r.won) wins,SUM(r.points) points,ROUND(AVG(r.points),2) "averagePoints",ROUND(100.0*SUM(r.won)/COUNT(*),1) "winRate" FROM results r JOIN profiles p ON r.profile=p.id LEFT JOIN profile_preferences f ON f.profile=p.id GROUP BY p.id,f.display_name ORDER BY "winRate" DESC,games DESC,"averagePoints" DESC LIMIT 100`,
    );
    const anonymous = await this.get<{ appearances: number; wins: number }>(
      'SELECT COUNT(*) appearances,COALESCE(SUM(won),0) wins FROM results WHERE profile IS NULL',
    )!;
    const totals = await this.get<{ games: number; appearances: number }>(
      'SELECT COUNT(DISTINCT room) games,COUNT(*) appearances FROM results',
    )!;
    return { rows, anonymous: anonymous!, totals: totals! };
  }
  async profile(identity: Identity) {
    check(identity.profileId, 'Sign in to see personal statistics.', 401);
    const results = await this.all<ResultRow>(
      'SELECT * FROM results WHERE profile=? ORDER BY finished DESC',
      identity.profileId,
    );
    const games = results.length,
      wins = results.reduce((n, r) => n + r.won, 0);
    const metrics = results.map((r) => JSON.parse(r.metrics) as PlayerMetrics);
    const sum = (fn: (m: PlayerMetrics) => number) => metrics.reduce((n, m) => n + fn(m), 0);
    const history = await Promise.all(
      results.map(async (r) => {
        const opponents = await this.all<{ name: string | null; points: number; won: number }>(
          'SELECT COALESCE(f.display_name,p.name) name,r.points,r.won FROM results r LEFT JOIN profiles p ON r.profile=p.id LEFT JOIN profile_preferences f ON f.profile=p.id WHERE r.room=? AND r.seat<>?',
          r.room,
          r.seat,
        );
        return {
          room: r.room,
          points: r.points,
          won: !!r.won,
          players: r.players,
          turns: r.turns,
          finished: r.finished,
          opponents: opponents.map((o) => ({
            name: o.name ?? 'Anonymous',
            points: o.points,
            won: !!o.won,
          })),
        };
      }),
    );
    return {
      name: identity.name,
      username: identity.username ?? identity.name,
      avatarUrl: identity.avatarUrl,
      sounds: await this.sounds(identity.profileId),
      games,
      wins,
      winRate: games ? (100 * wins) / games : 0,
      averagePoints: games ? results.reduce((n, r) => n + r.points, 0) / games : 0,
      bestPoints: Math.max(0, ...results.map((r) => r.points)),
      averageTurns: games ? results.reduce((n, r) => n + r.turns, 0) / games : 0,
      resourcesProduced: sum((m) => Object.values(m.produced).reduce((a, b) => a + b, 0)),
      trades: sum((m) => m.trades),
      cardsStolen: sum((m) => m.stolen),
      cardsLostToRobber: sum((m) => m.robbed),
      cardsDiscarded: sum((m) => m.discarded),
      roadsBuilt: sum((m) => m.roadsBuilt),
      settlementsBuilt: sum((m) => m.settlementsBuilt),
      citiesBuilt: sum((m) => m.citiesBuilt),
      developmentBought: sum((m) => m.developmentBought),
      bySize: [3, 4, 5, 6].map((size) => ({
        players: size,
        games: results.filter((r) => r.players === size).length,
        wins: results.filter((r) => r.players === size && r.won).length,
      })),
      history,
    };
  }
}
