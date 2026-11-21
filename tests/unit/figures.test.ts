import { test } from 'node:test';
import assert from 'node:assert/strict';
import { questionedByWorkOrder } from '../../src/lib/figures.ts';

test('Questioned money counts each work order once (overlapping flags are not added twice)', () => {
  const f = (type: string, wo: string, amt: number) => ({ type, work_order_id: wo, ward_code: 'K/W', contractor_id: 'CT01', amount_at_issue: amt, reason: '', evidence: {} });
  const r = questionedByWorkOrder([f('over_rate', 'WO1', 11091), f('over_budget', 'WO1', 23311), f('double_billing', 'WO2', 5000), f('sla_missed', 'WO3', 9999)] as never);
  assert.equal(r.total, 23311 + 5000, 'largest money flag per work order; non-money flags ignored');
  assert.equal(r.workOrders, 2);
  assert.equal(r.rawSum, 11091 + 23311 + 5000);
});
