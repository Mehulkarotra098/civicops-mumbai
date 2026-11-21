import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeNext } from '../../src/lib/next-path.ts';

test('Sign-in return path: keeps resident intent, rejects open redirects', () => {
  assert.equal(safeNext('/report?category=waterlogging', '/my'), '/report?category=waterlogging');
  assert.equal(safeNext('/tickets/CO-1', '/ward'), '/tickets/CO-1');
  for (const bad of ['https://evil.com', '//evil.com', '/\\evil.com', 'javascript:alert(1)', '', null, undefined, '/login?next=/x'])
    assert.equal(safeNext(bad as string, '/my'), '/my', String(bad));
  assert.equal(safeNext('/report', '/admin'), '/admin', 'staff are not sent to the resident report form');
});
