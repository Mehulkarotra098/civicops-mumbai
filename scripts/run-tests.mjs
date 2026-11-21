// Test runner: builds a fresh, isolated test database from the dataset, then runs node:test.
//   npm test          unit + integration tests (no server needed)
//   npm run test:e2e  browser tests against a running server (BASE_URL, default http://localhost:3000)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const kind = process.argv[2] ?? 'unit';
const env = { ...process.env, PGLITE_DIR: path.resolve('.data/test-db'), STORAGE_DIR: path.resolve('.data/test-uploads'), VISION_PROVIDER: 'stub' };
delete env.DATABASE_URL;
const node = process.execPath;
if (kind === 'unit') {
  const r = spawnSync(node, ['--experimental-strip-types', '--no-warnings', 'scripts/import.ts', '--reset'], { env, stdio: ['ignore', 'pipe', 'inherit'] });
  if (r.status !== 0) { console.error('Test database import failed'); process.exit(r.status ?? 1); }
  console.log('Fresh test database imported into .data/test-db');
}
const dir = kind === 'unit' ? 'tests/unit' : 'tests/e2e';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.ts')).map((f) => path.join(dir, f));
const t = spawnSync(node, ['--experimental-strip-types', '--no-warnings', '--test', '--test-concurrency=1', '--test-reporter=spec', ...files], { env, stdio: 'inherit' });
process.exit(t.status ?? 1);
