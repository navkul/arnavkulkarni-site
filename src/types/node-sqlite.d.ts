// Node 22 runtime API; repository currently uses the Node 20 type package.
declare module 'node:sqlite' {
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): {
      get(...params: (string | number | null)[]): Record<string, unknown> | undefined;
      all(...params: (string | number | null)[]): Record<string, unknown>[];
      run(...params: (string | number | null)[]): {
        changes: number | bigint;
        lastInsertRowid: number | bigint;
      };
    };
    close(): void;
  }
}
