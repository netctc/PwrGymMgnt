# Delivery 43 - Warehouse, Inventory and POS Module

## Scope

This delivery adds a new Warehouse, Inventory and POS module connected to Accounting and audit logging.

## Backend

New module: `server/warehouse.ts`.

New endpoints under `/api/warehouse`:

- `GET /api/warehouse/summary`
- `GET /api/warehouse/products`
- `POST /api/warehouse/products`
- `PUT /api/warehouse/products/:id`
- `GET /api/warehouse/suppliers`
- `POST /api/warehouse/suppliers`
- `PUT /api/warehouse/suppliers/:id`
- `POST /api/warehouse/stock-adjustments`
- `GET /api/warehouse/movements`
- `GET /api/warehouse/purchase-orders`
- `POST /api/warehouse/purchase-orders`
- `POST /api/warehouse/purchase-orders/:id/receive`
- `GET /api/warehouse/pos/catalog`
- `POST /api/warehouse/pos/sales`
- `GET /api/warehouse/pos/sales`
- `GET /api/warehouse/reports/:reportId.:format`

Supported report IDs:

- `inventory`
- `sales`
- `purchases`

Supported formats:

- `pdf`
- `csv`

## Database

New migration: `sql/016_warehouse_inventory_pos.sql`.

Tables:

- `warehouse_suppliers`
- `warehouse_products`
- `warehouse_product_batches`
- `warehouse_stock_movements`
- `warehouse_purchase_orders`
- `warehouse_purchase_order_items`
- `warehouse_pos_sales`
- `warehouse_pos_sale_items`
- `warehouse_pricing_rules`

Batch/lot, serial and expiration support is schema-ready through `warehouse_product_batches` and product expiry fields.

## Accounting integration

The module posts to `finance_transactions` automatically:

- Purchase order receipt posts an `expense` with category `Inventory Purchase`.
- POS sale posts an `income` with category `POS Sales`.
- POS sale posts an `expense` with category `Cost of Goods Sold`.
- Stock adjustments post inventory adjustment impact when value is affected.

All accounting writes use `reference_type` and `reference_id` to support traceability and duplicate prevention.

## Frontend

New route/page:

- `/warehouse`
- `src/pages/Warehouse.tsx`
- `src/lib/warehouseApi.ts`

Navigation label:

- `Warehouse & POS`

UI sections:

- Dashboard
- Products
- Suppliers
- Purchasing
- POS
- Reports

## RBAC

New roles recognized:

- `warehouse_manager`
- `cashier`

New permissions:

- `warehouse.read`
- `warehouse.write`
- `warehouse.purchase`
- `warehouse.pos`
- `warehouse.reports`

## Security and audit

- Every route requires authentication.
- Write routes are permission protected.
- Inventory/POS/purchasing events are written to `audit_logs`.
- Payment card details are not stored. Only payment method labels are recorded.

## Tests

New test file:

- `tests/warehouse.test.ts`

Covers:

- stock status derivation,
- POS totals, discounts, tax and COGS,
- money validation.

## Verification

Run:

```bash
npm ci
npm run verify:ci
npm run db:migrate
```

Manual smoke test:

1. Create a supplier.
2. Create a product with SKU/barcode/prices/min stock.
3. Create a purchase order and receive it.
4. Confirm product stock increased.
5. Post a POS sale.
6. Confirm stock decreased.
7. Open Accounting and confirm POS Sales and COGS transactions.
8. Export inventory/sales/purchase reports as PDF/CSV.
