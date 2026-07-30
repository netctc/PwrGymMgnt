import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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

test('demo stock repair is idempotent and restricted to the known demo signature', () => {
  const migration = fs.readFileSync(
    path.join(process.cwd(), 'sql/029_demo_stock_ledger_baseline.sql'),
    'utf8',
  );
  assert.match(migration, /product\.id = 'prod_023'/);
  assert.match(migration, /product\.sku = 'APP-HOODIE-BLK-L'/);
  assert.match(migration, /product\.stock_quantity = 38/);
  assert.match(migration, /JSON_EXTRACT\(product\.data, '\$\.demo'\)/);
  assert.match(migration, /latest\.id[\s\S]*= 'mov_po_003'/);
  assert.match(migration, /NOT EXISTS[\s\S]*repair_demo_stock_prod_023_v1/);
  assert.match(migration, /WAREHOUSE_DEMO_STOCK_BASELINE_REPAIRED/);
  assert.doesNotMatch(migration, /UPDATE\s+warehouse_products/i);
  assert.doesNotMatch(migration, /DELETE\s+FROM/i);
});
