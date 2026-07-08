-- Phase 6B: Warehouse first-load database indexes for runtime performance.
-- These indexes optimize the initial data load on the Warehouse management screen.
-- Guarded with INFORMATION_SCHEMA.COLUMNS checks for safety.

SET @db = DATABASE();

-- Products: status + updated_at + name for default inventory listing ORDER BY
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'warehouse_products' AND COLUMN_NAME = 'updated_at');
SET @sql = IF(@col > 0, 'CREATE INDEX idx_wh_products_status_updated_name ON warehouse_products (status, updated_at, name)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Products: status + category_id + updated_at for category-filtered listing
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'warehouse_products' AND COLUMN_NAME = 'category_id');
SET @sql = IF(@col > 0, 'CREATE INDEX idx_wh_products_status_category_updated ON warehouse_products (status, category_id, updated_at)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Suppliers: status + name for supplier listing
CREATE INDEX idx_wh_suppliers_status_name ON warehouse_suppliers (status, name);

-- Purchase orders: status + created_at for PO listing
CREATE INDEX idx_wh_po_status_created ON warehouse_purchase_orders (status, created_at);

-- Purchase orders: supplier_id + created_at for supplier-filtered PO listing
CREATE INDEX idx_wh_po_supplier_created ON warehouse_purchase_orders (supplier_id, created_at);

-- POS sales: status + sale_date for warehouse_pos_sales listing
CREATE INDEX idx_wh_sales_status_date ON warehouse_pos_sales (status, sale_date);

-- POS sales: payment_method + sale_date for payment-filtered sales report
CREATE INDEX idx_wh_sales_payment_date ON warehouse_pos_sales (payment_method, sale_date);
