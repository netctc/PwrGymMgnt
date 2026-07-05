-- Delivery 54B / Phase 6B - warehouse runtime performance indexes
-- Purpose: reduce first-load latency observed on Warehouse/POS read screens after structured runtime logging.
-- The migration is idempotent and creates indexes only when the target table and required columns exist.

SET NAMES utf8mb4;
SET @schema_name = DATABASE();

SET @sql = (SELECT IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_products')
  AND EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_products' AND COLUMN_NAME = 'status')
  AND EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_products' AND COLUMN_NAME = 'updated_at')
  AND EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_products' AND COLUMN_NAME = 'name')
  AND NOT EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_products' AND INDEX_NAME = 'idx_wh_products_status_updated_name'),
  'ALTER TABLE warehouse_products ADD INDEX idx_wh_products_status_updated_name (status, updated_at, name)',
  'SELECT 1'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_products')
  AND EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_products' AND COLUMN_NAME = 'status')
  AND EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_products' AND COLUMN_NAME = 'category_id')
  AND EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_products' AND COLUMN_NAME = 'updated_at')
  AND NOT EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_products' AND INDEX_NAME = 'idx_wh_products_status_category_updated'),
  'ALTER TABLE warehouse_products ADD INDEX idx_wh_products_status_category_updated (status, category_id, updated_at)',
  'SELECT 1'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_suppliers')
  AND EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_suppliers' AND COLUMN_NAME = 'status')
  AND EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_suppliers' AND COLUMN_NAME = 'name')
  AND NOT EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_suppliers' AND INDEX_NAME = 'idx_wh_suppliers_status_name'),
  'ALTER TABLE warehouse_suppliers ADD INDEX idx_wh_suppliers_status_name (status, name)',
  'SELECT 1'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_purchase_orders')
  AND EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_purchase_orders' AND COLUMN_NAME = 'status')
  AND EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_purchase_orders' AND COLUMN_NAME = 'created_at')
  AND NOT EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_purchase_orders' AND INDEX_NAME = 'idx_wh_po_status_created'),
  'ALTER TABLE warehouse_purchase_orders ADD INDEX idx_wh_po_status_created (status, created_at)',
  'SELECT 1'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_purchase_orders')
  AND EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_purchase_orders' AND COLUMN_NAME = 'supplier_id')
  AND EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_purchase_orders' AND COLUMN_NAME = 'created_at')
  AND NOT EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_purchase_orders' AND INDEX_NAME = 'idx_wh_po_supplier_created'),
  'ALTER TABLE warehouse_purchase_orders ADD INDEX idx_wh_po_supplier_created (supplier_id, created_at)',
  'SELECT 1'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_pos_sales')
  AND EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_pos_sales' AND COLUMN_NAME = 'status')
  AND EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_pos_sales' AND COLUMN_NAME = 'sale_date')
  AND NOT EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_pos_sales' AND INDEX_NAME = 'idx_wh_sales_status_date'),
  'ALTER TABLE warehouse_pos_sales ADD INDEX idx_wh_sales_status_date (status, sale_date)',
  'SELECT 1'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_pos_sales')
  AND EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_pos_sales' AND COLUMN_NAME = 'payment_method')
  AND EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_pos_sales' AND COLUMN_NAME = 'sale_date')
  AND NOT EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_pos_sales' AND INDEX_NAME = 'idx_wh_sales_payment_date'),
  'ALTER TABLE warehouse_pos_sales ADD INDEX idx_wh_sales_payment_date (payment_method, sale_date)',
  'SELECT 1'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
