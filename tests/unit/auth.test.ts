import { test } from 'node:test';
import assert from 'node:assert/strict';
import { login, ensureAdminFromEnv, userFromToken } from '../../src/lib/auth-core.ts';
import { testDb } from './helpers.ts';
import { withSystem } from '../../src/lib/db.ts';

test('Production (DEMO_MODE=0): published demo passwords cannot sign in; the env-provisioned admin can', async () => {
  const db = await testDb();
  const prev = { mode: process.env.DEMO_MODE, email: process.env.ADMIN_EMAIL, pw: process.env.ADMIN_PASSWORD };
  try {
    process.env.DEMO_MODE = '1';
    const demo = await login(db, 'admin@civicops.demo', 'CivicOps@2026');
    assert.ok(demo, 'demo accounts work in demo/preview mode');
    process.env.DEMO_MODE = '0';
    assert.equal(await login(db, 'admin@civicops.demo', 'CivicOps@2026'), null, 'refused in production');
    assert.equal(await userFromToken(db, demo!.token), null, 'existing demo sessions stop working too');
    process.env.ADMIN_EMAIL = 'ops.admin@example.test';
    process.env.ADMIN_PASSWORD = 'a-long-random-production-pass';
    assert.equal(await ensureAdminFromEnv(db), 'ops.admin@example.test');
    const real = await login(db, 'ops.admin@example.test', 'a-long-random-production-pass');
    assert.equal(real?.user.role, 'super_admin');
    assert.equal(await login(db, 'ops.admin@example.test', 'wrong-password'), null);
  } finally {
    await withSystem((q) => q.query(`delete from users where email = 'ops.admin@example.test'`), db);
    process.env.DEMO_MODE = prev.mode; process.env.ADMIN_EMAIL = prev.email; process.env.ADMIN_PASSWORD = prev.pw;
    if (prev.mode === undefined) delete process.env.DEMO_MODE;
    if (prev.email === undefined) delete process.env.ADMIN_EMAIL;
    if (prev.pw === undefined) delete process.env.ADMIN_PASSWORD;
  }
});
