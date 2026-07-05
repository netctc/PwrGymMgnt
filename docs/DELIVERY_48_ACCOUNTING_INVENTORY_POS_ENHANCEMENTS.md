# Delivery 48 - Accounting, Inventory, Supplier Orders & POS Enhancements

## Scope
This delivery completes several operational gaps across Accounting, Inventory, Supplier Orders and POS while preserving the unified principal navigation and screen design language introduced in previous Warehouse/POS releases.

## Implemented

### Accounting ledger filters
- Added combined filters in Accounting & Finance for:
  - date range,
  - transaction type,
  - category,
  - amount minimum,
  - amount maximum,
  - exact amount,
  - status.
- Updated the Finance API to support amount filters server-side using parameterized SQL.
- Filtered ledger results can be exported to CSV, Excel and PDF.
- Accounting categories now include existing finance transaction categories plus active Warehouse categories.

### Category management synchronization
- Ensured default Warehouse categories exist automatically:
  - General,
  - Apparel,
  - Equipment,
  - Supplements.
- Added duplicate category validation by category name and parent category.
- Category filters now work with both product `category_id` and legacy text categories.
- POS catalog and inventory endpoints now support category filtering consistently.

### Inventory product actions
- Added a replenishment action in the Inventory product Action column.
- The replenishment action opens the Purchase Order workflow and pre-populates:
  - product,
  - supplier,
  - cost,
  - suggested quantity based on stock/min-stock.
- Existing View/Edit/Archive actions remain active and role-protected by backend permissions.

### Supplier order status workflow
- Added manual supplier order workflow support:
  - Pending -> Shipped -> Received -> Invoiced.
- Added `warehouse_purchase_order_status_history` for traceability.
- Status changes record timestamp, user and notes.
- Receiving updates inventory and stock movements.
- Invoicing posts the accounting expense for Inventory Purchase.
- Purchase order detail modal now displays workflow history and accounting entries.

### Product image support
- Added optional product image field.
- Supports HTTPS JPEG/PNG URLs and uploaded JPEG/PNG previews stored as data URLs.
- Enforces a 1.5 MB size limit for uploaded images.
- Displays images in:
  - Inventory list,
  - POS product cards,
  - Product detail modal.

### POS product details
- POS product cards now include a View Details action.
- Product detail modal includes quick actions:
  - Add to Cart,
  - Print,
  - PDF export,
  - Edit.

## Database changes
New migration:

```text
sql/018_accounting_inventory_pos_workflow_improvements.sql
```

Adds or ensures:
- default categories,
- `warehouse_products.image_url`,
- `warehouse_purchase_orders.shipped_at`,
- `warehouse_purchase_orders.received_at`,
- `warehouse_purchase_orders.invoiced_at`,
- `warehouse_purchase_order_status_history`,
- finance indexes for amount/status/category filtering.

## Validation checklist
- Accounting ledger can be filtered by date/type/category/status/amount.
- Filtered accounting results export to CSV/Excel/PDF.
- Apparel, Equipment and Supplements appear in Inventory/POS category filters.
- Inventory Action column supports View, Replenish, Edit and Archive.
- Replenish pre-populates the PO form and navigates to Supplier Orders.
- PO modal supports status transitions and shows workflow history.
- Receiving a PO updates stock.
- Marking a received PO as invoiced posts Inventory Purchase expense to Accounting.
- Product images can be uploaded, previewed and replaced.
- POS product card View Details opens product modal and Add to Cart works.

## Notes
- Product image upload is intentionally dependency-free and uses browser FileReader data URLs.
- Apply the migration before testing image and status workflow fields on an existing database.
