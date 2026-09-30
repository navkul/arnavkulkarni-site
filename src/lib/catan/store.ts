import { DatabaseSync } from 'node:sqlite';
import {
  randomBytes,
  randomInt,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import { applyAction, RuleError, score } from './engine.ts';
import { type Action, type Game, type PlayerMetrics } from './types.ts';
import { createGame } from './engine.ts';
import { shuffle } from './board.ts';

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
  capacity: 4 | 6;
  host: string;
  seats: Seat[];
  status: 'lobby' | 'playing' | 'paused' | 'finished';
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
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE, password TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, guest TEXT NOT NULL, profile TEXT REFERENCES profiles(id), expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS results (room TEXT NOT NULL, seat TEXT NOT NULL, profile TEXT REFERENCES profiles(id), guest TEXT NOT NULL, points INTEGER NOT NULL, won INTEGER NOT NULL, players INTEGER NOT NULL, turns INTEGER NOT NULL, finished INTEGER NOT NULL, metrics TEXT NOT NULL, PRIMARY KEY(room,seat));
      CREATE INDEX IF NOT EXISTS results_profile ON results(profile);
      CREATE INDEX IF NOT EXISTS results_guest ON results(guest);
      CREATE TABLE IF NOT EXISTS odds_history (room TEXT NOT NULL, revision INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(room,revision));
      CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, start INTEGER NOT NULL, count INTEGER NOT NULL);
    `);
  }
  private get<T>(sql: string, ...params: (string | number | null)[]): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }
  private all<T>(sql: string, ...params: (string | number | null)[]): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  rateLimit(key: string, maximum: number, window = 60_000) {
    this.transaction(() => {
      const now = Date.now();
      const row = this.get<{ start: number; count: number }>(
        'SELECT start,count FROM limits WHERE key=?',
        key,
      );
      check(
        !row || row.start + window <= now || row.count < maximum,
        'Too many requests. Please wait and try again.',
        429,
      );
      if (!row || row.start + window <= now)
        this.db.prepare('INSERT OR REPLACE INTO limits VALUES(?,?,1)').run(key, now);
      else this.db.prepare('UPDATE limits SET count=count+1 WHERE key=?').run(key);
      this.db.prepare('DELETE FROM limits WHERE start<?').run(now - 86400_000);
    });
  }
  session(secret?: string): { identity: Identity; secret?: string } {
    if (secret && secret.length <= 128) {
      const row = this.get<{ guest: string; profile: string | null; name: string | null }>(
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
    this.db
      .prepare('INSERT INTO sessions VALUES(?,?,NULL,?)')
      .run(hash(fresh), guest, Date.now() + 30 * 86400_000);
    this.db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
    return { identity: { sessionHash: hash(fresh), guestId: guest }, secret: fresh };
  }
  private rotate(identity: Identity, profileId?: string) {
    const secret = token();
    this.db.prepare('DELETE FROM sessions WHERE hash=?').run(identity.sessionHash);
    this.db
      .prepare('INSERT INTO sessions VALUES(?,?,?,?)')
      .run(hash(secret), identity.guestId, profileId ?? null, Date.now() + 30 * 86400_000);
    return secret;
  }
  canRegister(identity: Identity) {
    return (
      !identity.profileId &&
      !!this.get(
        'SELECT 1 FROM results WHERE guest=? AND profile IS NULL LIMIT 1',
        identity.guestId,
      )
    );
  }
  async register(identity: Identity, name: unknown, password: string) {
    check(!identity.profileId, 'You are already signed in.');
    check(this.canRegister(identity), 'Complete your first game to create a profile.');
    const cleaned = cleanName(name);
    this.rateLimit(`register:${identity.guestId}`, 5, 3600_000);
    const encoded = await passwordHash(password);
    return this.transaction(() => {
      check(this.canRegister(identity), 'Your completed games have already been claimed.', 409);
      check(
        !this.get('SELECT 1 FROM profiles WHERE name_key=?', cleaned.toLowerCase()),
        'That profile name is already taken.',
        409,
      );
      const id = token();
      this.db
        .prepare('INSERT INTO profiles VALUES(?,?,?,?,?)')
        .run(id, cleaned, cleaned.toLowerCase(), encoded, Date.now());
      this.db
        .prepare('UPDATE results SET profile=? WHERE guest=? AND profile IS NULL')
        .run(id, identity.guestId);
      for (const room of this.rooms()) {
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
          this.save(room);
        }
      }
      return this.rotate(identity, id);
    });
  }
  async login(identity: Identity, name: unknown, password: string) {
    const cleaned = cleanName(name);
    this.rateLimit(`login:${cleaned.toLowerCase()}`, 10, 15 * 60_000);
    const profile = this.get<ProfileRow>(
      'SELECT * FROM profiles WHERE name_key=?',
      cleaned.toLowerCase(),
    );
    // Perform the same expensive operation for unknown names.
    const valid = await passwordMatches(
      password,
      profile?.password ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`,
    );
    check(profile && valid, 'Incorrect name or password.', 401);
    return this.transaction(() => this.rotate(identity, profile.id));
  }
  logout(identity: Identity) {
    return this.transaction(() => this.rotate(identity));
  }
  room(code: string): Room {
    check(typeof code === 'string' && /^[A-Z2-9]{6}$/.test(code), 'Invalid room code.', 404);
    const row = this.get<{ state: string }>('SELECT state FROM rooms WHERE code=?', code);
    check(row, 'Room not found.', 404);
    return JSON.parse(row.state) as Room;
  }
  rooms(): Room[] {
    return this.all<{ state: string }>('SELECT state FROM rooms').map((row) =>
      JSON.parse(row.state),
    );
  }
  private save(room: Room) {
    room.updatedAt = Date.now();
    this.db
      .prepare('INSERT OR REPLACE INTO rooms VALUES(?,?)')
      .run(room.code, JSON.stringify(room));
  }
  createRoom(identity: Identity, name: unknown, capacity: number, guestName: unknown): Room {
    check(capacity === 4 || capacity === 6, 'Choose the 3–4 or 5–6 player board.');
    const title = cleanName(name);
    const playerName = identity.name ?? cleanName(guestName);
    this.rateLimit(`create:${identity.guestId}`, 10, 3600_000);
    return this.transaction(() => {
      check(
        this.rooms().filter(
          (r) => r.status !== 'finished' && r.seats.some((s) => owns(identity, s)),
        ).length < 10,
        'You already have ten open rooms.',
      );
      let code: string;
      do {
        code = Array.from(
          { length: 6 },
          () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(32)],
        ).join('');
      } while (this.get('SELECT 1 FROM rooms WHERE code=?', code));
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
        host: seat.id,
        seats: [seat],
        status: 'lobby',
        revision: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.save(room);
      return room;
    });
  }
  join(identity: Identity, code: string, name: unknown): Room {
    return this.transaction(() => {
      const room = this.room(code);
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
      this.save(room);
      return room;
    });
  }
  change(
    identity: Identity,
    code: string,
    revision: number,
    command: 'start' | 'pause' | 'resume' | 'leave' | 'action',
    action?: Action,
  ): Room | undefined {
    return this.transaction(() => {
      const room = this.room(code);
      const seat = room.seats.find((s) => owns(identity, s));
      check(seat, 'You do not have a seat in this room.', 403);
      check(
        Number.isSafeInteger(revision) && revision === room.revision,
        'The game changed. Review the latest board and try again.',
        409,
      );
      if (command === 'start') {
        check(
          seat.id === room.host && room.status === 'lobby',
          'Only the host can start the lobby.',
          403,
        );
        check(
          room.seats.length >= (room.capacity === 6 ? 5 : 3),
          room.capacity === 6
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
        check(identity.profileId, 'Sign in to a profile to pause or resume games.', 403);
        check(
          room.status === (command === 'pause' ? 'playing' : 'paused'),
          'This game cannot be paused or resumed now.',
        );
        room.status = command === 'pause' ? 'paused' : 'playing';
      } else if (command === 'leave') {
        check(room.status === 'lobby', 'You can only leave before the game starts.');
        room.seats = room.seats.filter((s) => s.id !== seat.id);
        if (!room.seats.length) {
          this.db.prepare('DELETE FROM rooms WHERE code=?').run(code);
          return undefined;
        }
        if (room.host === seat.id) room.host = room.seats[0].id;
      } else if (command === 'action') {
        check(room.status === 'playing' && room.game && action, 'This game is not active.');
        const player = room.game.players.findIndex((p) => p.id === seat.id);
        try {
          room.game = applyAction(room.game, player, action, secureRandom);
        } catch (error) {
          if (error instanceof RuleError) throw new ServiceError(error.message);
          throw error;
        }
        if (room.game.winner !== undefined) {
          room.status = 'finished';
          room.finishedAt = Date.now();
          this.recordResults(room);
        }
      } else throw new ServiceError('Unknown room command.');
      room.revision++;
      this.save(room);
      return room;
    });
  }
  private recordResults(room: Room) {
    const game = room.game!;
    game.players.forEach((p, i) => {
      const seat = room.seats.find((s) => s.id === p.id)!;
      this.db
        .prepare('INSERT OR IGNORE INTO results VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(
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
    });
  }
  saveOdds(code: string, odds: Odds) {
    this.transaction(() => {
      const room = this.room(code);
      // Preserve every evaluated action, even when a newer move arrives mid-evaluation.
      this.db
        .prepare('INSERT OR REPLACE INTO odds_history VALUES(?,?,?)')
        .run(code, odds.revision, JSON.stringify(odds));
      if (!room.odds || odds.revision > room.odds.revision) {
        room.odds = odds;
        this.save(room);
      }
    });
  }
  oddsHistory(code: string): Odds[] {
    return this.all<{ data: string }>(
      'SELECT data FROM odds_history WHERE room=? ORDER BY revision DESC LIMIT 100',
      code,
    )
      .reverse()
      .map((r) => JSON.parse(r.data));
  }
  leaderboard() {
    const rows = this.all<{
      name: string;
      games: number;
      wins: number;
      points: number;
      averagePoints: number;
      winRate: number;
    }>(
      `SELECT p.name,COUNT(*) games,SUM(r.won) wins,SUM(r.points) points,ROUND(AVG(r.points),2) averagePoints,ROUND(100.0*SUM(r.won)/COUNT(*),1) winRate FROM results r JOIN profiles p ON r.profile=p.id GROUP BY p.id ORDER BY winRate DESC,games DESC,averagePoints DESC LIMIT 100`,
    );
    const anonymous = this.get<{ appearances: number; wins: number }>(
      'SELECT COUNT(*) appearances,COALESCE(SUM(won),0) wins FROM results WHERE profile IS NULL',
    )!;
    const totals = this.get<{ games: number; appearances: number }>(
      'SELECT COUNT(DISTINCT room) games,COUNT(*) appearances FROM results',
    )!;
    return { rows, anonymous, totals };
  }
  profile(identity: Identity) {
    check(identity.profileId, 'Sign in to see personal statistics.', 401);
    const results = this.all<ResultRow>(
      'SELECT * FROM results WHERE profile=? ORDER BY finished DESC',
      identity.profileId,
    );
    const games = results.length,
      wins = results.reduce((n, r) => n + r.won, 0);
    const metrics = results.map((r) => JSON.parse(r.metrics) as PlayerMetrics);
    const sum = (fn: (m: PlayerMetrics) => number) => metrics.reduce((n, m) => n + fn(m), 0);
    const history = results.map((r) => {
      const opponents = this.all<{ name: string | null; points: number; won: number }>(
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
    });
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
