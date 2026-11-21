// Shared helpers for integration tests. The runner (scripts/run-tests.mjs) imports the full
// dataset into .data/test-db before the tests start; each test file opens that database.
import { openDb, setDb, withSystem, type Actor, type Db } from '../../src/lib/db.ts';
import { illustration, saveEvidence } from '../../src/lib/evidence.ts';

let shared: Db | null = null;

export async function testDb(): Promise<Db> {
  if (shared) return shared;
  const dir = process.env.PGLITE_DIR;
  if (!dir || !dir.includes('test-db')) throw new Error('Run tests with `npm test` so they use the isolated test database');
  shared = await openDb({ dataDir: dir });
  setDb(shared);
  return shared;
}

export async function actor(db: Db, email: string): Promise<Actor> {
  const r = await withSystem((q) => q.query<{ id: string; role: Actor['role']; name: string }>('select id, role, name from users where email = $1', [email]), db);
  if (!r.rows[0]) throw new Error(`No user ${email}`);
  return r.rows[0];
}

export const H = 3600_000;
export const at = (base: Date, hours: number) => new Date(base.getTime() + hours * H);

export async function photo(db: Db, who: Actor, ticketId: string, scene: Parameters<typeof illustration>[0], phase: 'report' | 'before' | 'after', when: Date) {
  return saveEvidence(db, who, ticketId, { data: await illustration(scene, `${ticketId.slice(0, 8)} ${phase} ${when.toISOString()}`), mime: 'image/jpeg' }, { phase, origin: 'illustration' }, when);
}

export async function row<T = Record<string, unknown>>(db: Db, sql: string, params: unknown[] = []): Promise<T> {
  return (await withSystem((q) => q.query<T>(sql, params), db)).rows[0];
}
export async function rows<T = Record<string, unknown>>(db: Db, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await withSystem((q) => q.query<T>(sql, params), db)).rows;
}

export const JUHU = { lat: 19.1279, lon: 72.8466, gpsAccuracyM: 12, source: 'gps' as const };
export const ANDHERI_EAST = { lat: 19.1115, lon: 72.8655, gpsAccuracyM: 15, source: 'gps' as const };
