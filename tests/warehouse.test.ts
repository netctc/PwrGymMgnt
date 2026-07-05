import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateSaleTotals, deriveStockStatus, validateWarehouseMoney } from '../server/warehouse.ts';

test('warehouse stock status derives low, overstock and out-of-stock states', () => {
  assert.equal(deriveStockStatus({ stockQuantity: 0, minStock: 5, maxStock: 20, status: 'active' }), 'out_of_stock');
  assert.equal(deriveStockStatus({ stockQuantity: 3, minStock: 5, maxStock: 20, status: 'active' }), 'low_stock');
  assert.equal(deriveStockStatus({ stockQuantity: 25, minStock: 5, maxStock: 20, status: 'active' }), 'overstock');
  assert.equal(deriveStockStatus({ stockQuantity: 10, minStock: 5, maxStock: 20, status: 'active' }), 'active');
  assert.equal(deriveStockStatus({ stockQuantity: 10, minStock: 5, maxStock: 20, status: 'archived' }), 'archived');
});

test('warehouse POS totals include discounts, tax and COGS', () => {
  const totals = calculateSaleTotals([
    { productId: 'a', quantity: 2, resolvedUnitPrice: 10, costPrice: 4, discount: 1 },
    { productId: 'b', quantity: 1, resolvedUnitPrice: 20, costPrice: 12 },
  ], { discountTotal: 2, taxRate: 0.1 });

  assert.equal(totals.subtotal, 39);
  assert.equal(totals.itemDiscount, 1);
  assert.equal(totals.discountTotal, 3);
  assert.equal(totals.taxTotal, 3.7);
  assert.equal(totals.total, 40.7);
  assert.equal(totals.cogs, 20);
});

test('warehouse money validation rejects negative and non-numeric values', () => {
  assert.equal(validateWarehouseMoney('12.345', 'Retail'), 12.35);
  assert.throws(() => validateWarehouseMoney('-1', 'Retail'), /Retail must be zero or greater/);
  assert.throws(() => validateWarehouseMoney('abc', 'Retail'), /Retail must be zero or greater/);
});
