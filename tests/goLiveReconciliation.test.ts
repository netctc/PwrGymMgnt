import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateReconciliation,
  parseReconciliationArgs,
} from '../scripts/go-live-reconciliation.mjs';

const snapshot = {
  ledgerNetBalance: 1250.5,
  negativeStockCount: 0,
  latestMovementMismatchCount: 0,
  products: [
    { sku: 'SKU-1', systemQuantity: 3 },
    { sku: 'SKU-2', systemQuantity: 5 },
  ],
};

test('reconciliation without an external baseline remains under review', () => {
  assert.equal(evaluateReconciliation(snapshot, null).posture, 'review');
});

test('reconciliation passes only with matching accounting and physical values', () => {
  const result = evaluateReconciliation(snapshot, {
    approvedLedgerBalance: 1250.5,
    physicalStock: [
      { sku: 'SKU-1', quantity: 3 },
      { sku: 'SKU-2', quantity: 5 },
    ],
  });
  assert.equal(result.posture, 'pass');
  assert.deepEqual(result.findings, []);
});

test('reconciliation blocks balance, stock and ledger discrepancies', () => {
  const result = evaluateReconciliation(
    {
      ...snapshot,
      negativeStockCount: 1,
      latestMovementMismatchCount: 2,
      stockLedgerMismatches: [
        {
          sku: 'SKU-1',
          name: 'Test product',
          systemQuantity: 3,
          latestMovementQuantity: 2,
          latestMovementAt: '2026-07-30T00:00:00.000Z',
        },
      ],
    },
    {
      approvedLedgerBalance: 1200,
      physicalStock: [{ sku: 'SKU-1', quantity: 2 }],
    },
  );
  assert.equal(result.posture, 'block');
  assert.ok(result.findings.some((finding) => finding.id === 'ledger-balance-difference'));
  assert.ok(result.findings.some((finding) => finding.id === 'physical-count-missing'));
  const mismatch = result.findings.find((finding) => finding.id === 'stock-ledger-mismatch');
  assert.deepEqual(mismatch?.products?.[0], {
    sku: 'SKU-1',
    name: 'Test product',
    systemQuantity: 3,
    latestMovementQuantity: 2,
    latestMovementAt: '2026-07-30T00:00:00.000Z',
  });
});

test('reconciliation input and template modes are mutually exclusive', () => {
  assert.throws(
    () => parseReconciliationArgs(['--input=a.json', '--write-template=b.json']),
    /cannot be used together/,
  );
});
