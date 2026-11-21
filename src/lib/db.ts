// Database access. Two drivers with one interface:
//  - PGlite (default): real PostgreSQL compiled to WebAssembly, persisted in .data/pgdata.
//    Single process, so the Next.js server owns it; scripts use it only while the server is stopped.
//  - node-postgres: set DATABASE_URL to use hosted PostgreSQL (Neon, Supabase, RDS).
// Every user request runs in `withUser`, which switches to the restricted civicops_app role
// and sets app.user_id / app.role so row-level security applies inside the database.
import fs from 'node:fs';
import path from 'node:path';

export interface QueryResult<T> { rows: T[]; affectedRows: number }
export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
}
export interface Db extends Queryable {
  kind: 'pglite' | 'postgres';
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

export interface Actor { id: string; role: 'resident' | 'officer' | 'ward_admin' | 'super_admin'; name: string }

type PGliteLike = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; affectedRows?: number }>;
  exec: (sql: string) => Promise<unknown>;
  transaction: <T>(fn: (tx: { query: PGliteLike['query'] }) => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
  waitReady: Promise<void>;
};

export async function openPglite(dataDir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  if (dataDir) fs.mkdirSync(dataDir, { recursive: true });
  const pg = (dataDir ? new PGlite(dataDir) : new PGlite()) as unknown as PGliteLike;
  await pg.waitReady;
  const wrap = (q: PGliteLike['query']): Queryable['query'] => async (sql, params) => {
    const r = await q(sql, params as unknown[]);
    return { rows: r.rows as never[], affectedRows: r.affectedRows ?? 0 };
  };
  return {
    kind: 'pglite',
    query: wrap(pg.query.bind(pg)),
    exec: async (sql) => { await pg.exec(sql); },
    transaction: (fn) => pg.transaction((tx) => fn({ query: wrap(tx.query.bind(tx)) })),
    close: () => pg.close(),
  };
}

export async function openPostgres(url: string): Promise<Db> {
  const pgMod = await import('pg');
  const Pool = (pgMod.default ?? pgMod).Pool;
  const pool = new Pool({ connectionString: url, max: 10 });
  const wrap = (c: { query: (s: string, p?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }> }): Queryable['query'] =>
    async (sql, params) => {
      const r = await c.query(sql, params as unknown[]);
      return { rows: r.rows as never[], affectedRows: r.rowCount ?? 0 };
    };
  return {
    kind: 'postgres',
    query: wrap(pool),
    exec: async (sql) => { await pool.query(sql); },
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const out = await fn({ query: wrap(client) });
        await client.query('commit');
        return out;
      } catch (e) {
        await client.query('rollback').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

export function defaultDataDir(): string {
  return process.env.PGLITE_DIR || path.join(process.cwd(), '.data', 'pgdata');
}

export async function openDb(opts: { dataDir?: string; memory?: boolean } = {}): Promise<Db> {
  if (process.env.DATABASE_URL && !opts.memory && !opts.dataDir) return openPostgres(process.env.DATABASE_URL);
  return openPglite(opts.memory ? undefined : opts.dataDir ?? defaultDataDir());
}

// ---------- shared server instance ----------
const g = globalThis as unknown as { __civicopsDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  if (!g.__civicopsDb) {
    g.__civicopsDb = openDb();
    // The server owns the local PGlite folder; the importer refuses to run while this lock is live.
    if (!process.env.DATABASE_URL) {
      try {
        fs.mkdirSync(path.dirname(defaultDataDir()), { recursive: true });
        fs.writeFileSync(`${defaultDataDir()}.lock`, String(process.pid));
      } catch { /* read-only filesystem: ignore */ }
    }
  }
  return g.__civicopsDb;
}

/** For tests: inject a specific database instance. */
export function setDb(db: Db) {
  g.__civicopsDb = Promise.resolve(db);
}

/** Run as a signed-in user. Row-level security applies to everything inside. */
export async function withUser<T>(actor: Actor, fn: (tx: Queryable) => Promise<T>, db?: Db): Promise<T> {
  const d = db ?? (await getDb());
  return d.transaction(async (tx) => {
    await tx.query('set local role civicops_app');
    await tx.query(`select set_config('app.user_id', $1, true), set_config('app.role', $2, true)`, [actor.id, actor.role]);
    return fn(tx);
  });
}

/**
 * Inside a withUser transaction, run one trusted statement as the system and switch back.
 * Used only for ownership changes (transfer / route): the actor's access to the current row
 * has already been checked under RLS, but after the change they may no longer see the row,
 * which PostgreSQL would otherwise reject.
 */
export async function elevated<T>(q: Queryable, actor: Actor, fn: () => Promise<T>): Promise<T> {
  await q.query('reset role');
  await q.query(`select set_config('app.role', 'system', true)`);
  try {
    return await fn();
  } finally {
    await q.query('set local role civicops_app');
    await q.query(`select set_config('app.role', $1, true)`, [actor.role]);
  }
}

/** Run as the system (importer, scheduler, auth). Not exposed to user input. */
export async function withSystem<T>(fn: (tx: Queryable) => Promise<T>, db?: Db): Promise<T> {
  const d = db ?? (await getDb());
  return d.transaction(async (tx) => {
    await tx.query(`select set_config('app.role', 'system', true), set_config('app.user_id', '', true)`);
    return fn(tx);
  });
}

export async function runMigrations(db: Db, dir = path.join(process.cwd(), 'migrations')): Promise<string[]> {
  await db.exec(`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`);
  const done = new Set((await db.query<{ name: string }>('select name from schema_migrations')).rows.map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
  const applied: string[] = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    await db.exec(sql);
    await db.query('insert into schema_migrations (name) values ($1)', [f]);
    applied.push(f);
  }
  return applied;
}

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
