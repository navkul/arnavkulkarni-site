import { LocalDatabase, PostgresDatabase, type Database } from './database.ts';
import {
  randomBytes,
  randomInt,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import { applyAction, RuleError, score, roadSites, settlementSites } from './engine.ts';
import { RESOURCES, type Action, type Game, type PlayerMetrics } from './types.ts';
import { createGame } from './engine.ts';
import { shuffle } from './board.ts';
import { testingAvailable } from './testing-mode.ts';

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
export interface Identity {
  sessionHash: string;
  guestId: string;
  profileId?: string;
  name?: string;
}
export interface Seat {
  id: string;
  name: string;
  guestId: string;
  profileId?: string;
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
  testPlayer?: number;
  host: string;
  seats: Seat[];
  status: 'lobby' | 'playing' | 'paused' | 'finished' | 'ended';
  revision: number;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  finishedAt?: number;
  game?: Game;
  odds?: Odds;
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
  return room.testing && testingAvailable() && owner?.id === room.host
    ? room.seats[room.testPlayer ?? 0]
    : owner;
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
      const row = await this.get<{ guest: string; profile: string | null; name: string | null }>(
        `SELECT s.guest,s.profile,p.name FROM sessions s LEFT JOIN profiles p ON s.profile=p.id WHERE s.hash=? AND s.expires>?`,
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
    return (
      this.hosting === 'server' &&
      !identity.profileId &&
      !!(await this.get(
        'SELECT 1 FROM results WHERE guest=? AND profile IS NULL LIMIT 1',
        identity.guestId,
      ))
    );
  }
  async register(identity: Identity, name: unknown, password: string) {
    check(this.hosting === 'server', 'Profiles are available in online games only.', 403);
    check(!identity.profileId, 'You are already signed in.');
    check(await this.canRegister(identity), 'Complete your first game to create a profile.');
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
    check(this.hosting === 'server', 'Profiles are available in online games only.', 403);
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
    if (room.game && room.status !== 'ended' && room.winProbability !== false)
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
        guestId: identity.guestId,
        profileId: identity.profileId,
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
      const room = await this.createRoom(identity, name, capacity, guestName, false);
      room.testing = true;
      room.testPlayer = 0;
      while (room.seats.length < capacity)
        room.seats.push({
          id: token(),
          guestId: token(),
          name: `Test player ${room.seats.length + 1}`,
        });
      let game = createGame(
        room.seats.map((s) => ({ id: s.id, name: s.name })),
        secureRandom,
      );
      while (game.phase.startsWith('setup')) {
        const action: Action =
          game.phase === 'setup-settlement'
            ? { type: 'settlement', vertex: settlementSites(game, game.active, true)[0] }
            : { type: 'road', edge: roadSites(game, game.active, game.setupVertex)[0] };
        game = applyAction(game, game.active, action, secureRandom);
      }
      // Stock every test hand from the bank so builds, cards and trades can be explored.
      for (const player of game.players)
        for (const resource of RESOURCES) {
          const extra = Math.min(game.bank[resource], Math.max(0, 3 - player.resources[resource]));
          player.resources[resource] += extra;
          game.bank[resource] -= extra;
        }
      room.game = game;
      room.status = 'playing';
      room.startedAt = Date.now();
      room.revision++;
      await this.save(room);
      return room;
    });
  }
  async selectTestPlayer(identity: Identity, code: string, revision: number, player: unknown) {
    check(
      testingAvailable() && this.hosting === 'local',
      'Testing mode is available only in local development.',
      403,
    );
    return this.transaction(async () => {
      const room = await this.room(code);
      check(
        room.testing && room.seats.some((s) => s.id === room.host && owns(identity, s)),
        'Only the test host can control these seats.',
        403,
      );
      check(revision === room.revision, 'The game changed. Try again.', 409);
      check(
        Number.isInteger(player) && Number(player) >= 0 && Number(player) < room.seats.length,
        'Choose a test player.',
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
        guestId: identity.guestId,
        profileId: identity.profileId,
      });
      room.revision++;
      await this.save(room);
      return room;
    });
  }
  async change(
    identity: Identity,
    code: string,
    revision: number,
    command: 'start' | 'pause' | 'resume' | 'leave' | 'action' | 'end-game',
    action?: Action,
  ): Promise<Room | undefined> {
    return this.transaction(async () => {
      const room = await this.room(code);
      const seat = room.seats.find((s) => owns(identity, s));
      check(seat, 'You do not have a seat in this room.', 403);
      check(
        Number.isSafeInteger(revision) && revision === room.revision,
        'The game changed. Review the latest board and try again.',
        409,
      );
      check(!room.testing || testingAvailable(), 'Test games require local development.', 403);
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
        room.seats = shuffle(room.seats, secureRandom);
        room.game = createGame(
          room.seats.map((s) => ({ id: s.id, name: s.name, profileId: s.profileId })),
          secureRandom,
        );
        room.startedAt = Date.now();
        room.status = 'playing';
      } else if (command === 'pause' || command === 'resume') {
        check(
          identity.profileId || (room.hosting === 'local' && seat.id === room.host),
          'Sign in to a profile to pause or resume games.',
          403,
        );
        check(
          room.status === (command === 'pause' ? 'playing' : 'paused'),
          'This game cannot be paused or resumed now.',
        );
        room.status = command === 'pause' ? 'paused' : 'playing';
      } else if (command === 'end-game') {
        check(seat.id === room.host, 'Only the host can end the game.', 403);
        check(
          room.game && ['playing', 'paused'].includes(room.status),
          'This game is already closed.',
        );
        room.status = 'ended';
        room.finishedAt = Date.now();
        room.game.offer = undefined;
        room.game.log.push({
          turn: room.game.turn,
          text: `${seat.name} ended the game early. No results were recorded.`,
        });
      } else if (command === 'leave') {
        check(room.status === 'lobby', 'You can only leave before the game starts.');
        room.seats = room.seats.filter((s) => s.id !== seat.id);
        if (!room.seats.length) {
          await this.query('DELETE FROM rooms WHERE code=?', code);
          return undefined;
        }
        if (room.host === seat.id) room.host = room.seats[0].id;
      } else if (command === 'action') {
        check(room.status === 'playing' && room.game && action, 'This game is not active.');
        const actor = controlledSeat(room, identity)!;
        const player = room.game.players.findIndex((p) => p.id === actor.id);
        try {
          room.game = applyAction(room.game, player, action, secureRandom);
          if (room.testing)
            room.testPlayer =
              room.game.phase === 'discard'
                ? Number(Object.keys(room.game.discard)[0])
                : room.game.active;
        } catch (error) {
          if (error instanceof RuleError) throw new ServiceError(error.message);
          throw error;
        }
        if (room.game.winner !== undefined) {
          room.status = 'finished';
          room.finishedAt = Date.now();
          await this.recordResults(room);
        }
      } else throw new ServiceError('Unknown room command.');
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
  async leaderboard() {
    const rows = await this.all<{
      name: string;
      games: number;
      wins: number;
      points: number;
      averagePoints: number;
      winRate: number;
    }>(
      `SELECT p.name,COUNT(*) games,SUM(r.won) wins,SUM(r.points) points,ROUND(AVG(r.points),2) "averagePoints",ROUND(100.0*SUM(r.won)/COUNT(*),1) "winRate" FROM results r JOIN profiles p ON r.profile=p.id GROUP BY p.id ORDER BY "winRate" DESC,games DESC,"averagePoints" DESC LIMIT 100`,
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
    check(this.hosting === 'server', 'Profiles are available in online games only.', 403);
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
          'SELECT p.name,r.points,r.won FROM results r LEFT JOIN profiles p ON r.profile=p.id WHERE r.room=? AND r.seat<>?',
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
