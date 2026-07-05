# Delivery 47 - Warehouse Inventory Actions, Categories and Detail Modals

## Objective
Complete the Warehouse & Inventory enhancement scope by making product categories dynamic, activating the Inventory action column, and adding detail modals for products and purchase orders with accounting traceability.

## Implemented

### Category Management
- Added `warehouse_categories` table with root/subcategory support through `parent_id`.
- Added migration `sql/017_warehouse_categories_actions.sql`.
- Added backend category endpoints:
  - `GET /api/warehouse/categories`
  - `POST /api/warehouse/categories`
  - `PUT /api/warehouse/categories/:id`
  - `DELETE /api/warehouse/categories/:id`
- Categories are linked to products with `warehouse_products.category_id` while keeping the legacy `category` text field for compatibility.
- Product reports can now be filtered by category.
- POS and Purchase reports accept category filters through the same reporting API.

### Inventory Action Column
- Replaced the static action icon with working actions:
  - View product detail modal
  - Edit product details
  - Archive/delete product with confirmation
- Edit supports product name, SKU, barcode, category, supplier, stock level, pricing, thresholds, unit, location, expiry and status.
- Delete is soft-delete/archive and is protected by backend RBAC. Only `super_admin`, `admin`, `manager`, or `warehouse_manager` roles can archive products.

### Product Detail Modal
- Clicking a SKU or View opens a modal with:
  - SKU/name/category/supplier
  - current stock and valuation
  - stock status and expiry
  - purchase history
  - POS sales history
  - stock movement history
  - linked accounting entries
- Modal quick actions:
  - Edit
  - Export product detail PDF

### Purchase Order Detail Modal
- Clicking a PO number opens a modal with:
  - supplier details
  - order date, expected delivery, total, status
  - product line items with SKU, category, quantity, received quantity, unit cost and line total
  - linked accounting entries
- Modal quick actions:
  - Print
  - Export PDF
  - Receive PO when not already received

### Integration and Consistency
- UI uses the same application background and card/table language as the rest of PowerGym.
- No extra parallel menu was added; the existing principal Warehouse menu tabs are preserved.
- Accounting remains backend-driven:
  - POS income
  - COGS expense
  - inventory purchase expense
  - stock adjustment impact

## Gap Analysis Corrections Applied

| Gap | Corrective action |
| --- | --- |
| Static Action column | Added View/Edit/Delete buttons with real API calls. |
| No category CRUD | Added dynamic category management with hierarchy. |
| Category reporting incomplete | Added category filters to warehouse reports. |
| PO number not clickable | Added purchase order detail modal and PDF export. |
| Product code not clickable | SKU opens product detail modal. |
| Missing accounting traceability in UI | Product and PO modals include linked finance entries. |
| Unsafe delete flow | Added confirmation prompt and server-side role guard. |

## Validation

Commands executed:

```bash
./node_modules/.bin/tsc --noEmit --pretty false
npm run test:ci
npm run build
npm run bundle:budget
npm run audit
```

Results:

- Typecheck: OK
- Tests: OK, 74/74
- Build: OK
- Bundle budget: OK
- Audit: OK, 0 vulnerabilities

## Manual QA Checklist

1. Open Warehouse > Inventory.
2. Create a parent category and a subcategory.
3. Create or edit a product and assign it to the subcategory.
4. Confirm category filters affect Inventory and POS.
5. Click a SKU and verify product modal, history and accounting sections.
6. Click Edit from the modal and update stock/pricing/category.
7. Archive a product and confirm it disappears from active lists.
8. Open Warehouse > Suppliers.
9. Click a PO number and verify PO details, supplier info, products and accounting entries.
10. Export a product PDF and a PO PDF.
11. Receive a PO and verify stock/accounting updates remain synchronized.
