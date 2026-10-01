import { Pool, type PoolClient } from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

const schema = `
        CREATE SCHEMA IF NOT EXISTS catan;
        CREATE TABLE IF NOT EXISTS catan.profiles (id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE, password TEXT NOT NULL, created BIGINT NOT NULL);
        CREATE TABLE IF NOT EXISTS catan.sessions (hash TEXT PRIMARY KEY, guest TEXT NOT NULL, profile TEXT REFERENCES catan.profiles(id), expires BIGINT NOT NULL);
        CREATE TABLE IF NOT EXISTS catan.rooms (code TEXT PRIMARY KEY, state TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS catan.results (room TEXT NOT NULL, seat TEXT NOT NULL, profile TEXT REFERENCES catan.profiles(id), guest TEXT NOT NULL, points INTEGER NOT NULL, won INTEGER NOT NULL, players INTEGER NOT NULL, turns INTEGER NOT NULL, finished BIGINT NOT NULL, metrics TEXT NOT NULL, PRIMARY KEY(room,seat));
        CREATE INDEX IF NOT EXISTS results_profile ON catan.results(profile);
        CREATE INDEX IF NOT EXISTS results_guest ON catan.results(guest);
        CREATE TABLE IF NOT EXISTS catan.odds_history (room TEXT NOT NULL, revision INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(room,revision));
        CREATE TABLE IF NOT EXISTS catan.limits (key TEXT PRIMARY KEY, start BIGINT NOT NULL, count INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS catan.jobs (room TEXT NOT NULL, revision INTEGER NOT NULL, snapshot TEXT NOT NULL, published BIGINT NOT NULL DEFAULT 0, completed BOOLEAN NOT NULL DEFAULT FALSE, PRIMARY KEY(room,revision));
      `;
type Parameters = (string | number | null)[];
export interface Database {
  query(sql: string, params: Parameters): Promise<Record<string, unknown>[]>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export class PostgresDatabase implements Database {
  private readonly pool: Pool;
  private readonly context = new AsyncLocalStorage<PoolClient>();
  private readonly ready: Promise<void>;
  constructor(url: string) {
    this.pool = new Pool({
      connectionString: url,
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
    this.ready = this.initialize();
  }
  private async initialize() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(739214,0)');
      await client.query(schema);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async query(sql: string, params: Parameters) {
    await this.ready;
    let index = 0;
    const text = sql
      .replace(/\?/g, () => `$${++index}`)
      .replace(
        /\b(FROM|INTO|UPDATE|JOIN) (profiles|sessions|rooms|results|odds_history|limits|jobs)\b/g,
        '$1 catan.$2',
      );
    const result = await (this.context.getStore() ?? this.pool).query(text, params);
    return result.rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          result.fields.some((f) => f.name === key && [20, 1700].includes(f.dataTypeID)) &&
          value !== null
            ? Number(value)
            : value,
        ]),
      ),
    );
  }
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    await this.ready;
    if (this.context.getStore()) return fn();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(739214,1)');
      const result = await this.context.run(client, fn);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async close() {
    await this.ready;
    await this.pool.end();
  }
}
/** One local host process, with disk persistence and a mutex shared by all its requests. */
export class LocalDatabase implements Database {
  private db!: DatabaseSync;
  private readonly ready: Promise<void>;
  private tail: Promise<unknown> = Promise.resolve();
  private readonly context = new AsyncLocalStorage<boolean>();
  constructor(path: string) {
    this.ready = this.initialize(path);
  }
  private async initialize(path: string) {
    const { DatabaseSync } = await import('node:sqlite');
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
    this.db.exec(schema.replace('CREATE SCHEMA IF NOT EXISTS catan;', '').replaceAll('catan.', ''));
  }
  private async serial<T>(fn: () => Promise<T>): Promise<T> {
    await this.ready;
    if (this.context.getStore()) return fn();
    const job = this.tail.then(() => this.context.run(true, fn));
    this.tail = job.catch(() => {});
    return job;
  }
  async query(sql: string, params: Parameters) {
    return this.serial(async () => {
      const statement = this.db.prepare(sql.replaceAll('catan.', ''));
      if (/^\s*(SELECT|WITH)/i.test(sql)) return statement.all(...params);
      statement.run(...params);
      return [];
    });
  }
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.context.getStore()) return fn();
    return this.serial(async () => {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        const result = await fn();
        this.db.exec('COMMIT');
        return result;
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    });
  }
  async close() {
    await this.serial(async () => this.db.close());
  }
}
