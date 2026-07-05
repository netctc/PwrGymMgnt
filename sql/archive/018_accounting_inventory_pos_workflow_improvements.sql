-- Delivery 48 - Accounting, Inventory, Supplier Orders & POS improvements
-- Safe/idempotent migration for category defaults, product images and PO workflow history.

SET @schema_name = DATABASE();

CREATE TABLE IF NOT EXISTS warehouse_categories (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(180) NOT NULL,
  parent_id VARCHAR(64) NULL,
  description TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data JSON NULL,
  UNIQUE KEY uq_wh_category_slug (slug),
  INDEX idx_wh_category_parent (parent_id),
  INDEX idx_wh_category_status (status),
  INDEX idx_wh_category_name (name)
);

INSERT IGNORE INTO warehouse_categories (id, name, slug, parent_id, description, status)
VALUES
  ('cat_general', 'General', 'general', NULL, 'Default product category', 'active'),
  ('cat_apparel', 'Apparel', 'apparel', NULL, 'Clothing and branded merchandise', 'active'),
  ('cat_equipment', 'Equipment', 'equipment', NULL, 'Fitness equipment, accessories and replacement parts', 'active'),
  ('cat_supplements', 'Supplements', 'supplements', NULL, 'Nutrition, protein and recovery products', 'active');

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE warehouse_products ADD COLUMN image_url TEXT NULL', 'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_products' AND COLUMN_NAME = 'image_url');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE warehouse_purchase_orders ADD COLUMN shipped_at DATETIME NULL', 'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_purchase_orders' AND COLUMN_NAME = 'shipped_at');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE warehouse_purchase_orders ADD COLUMN received_at DATETIME NULL', 'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_purchase_orders' AND COLUMN_NAME = 'received_at');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE warehouse_purchase_orders ADD COLUMN invoiced_at DATETIME NULL', 'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_purchase_orders' AND COLUMN_NAME = 'invoiced_at');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS warehouse_purchase_order_status_history (
  id VARCHAR(64) PRIMARY KEY,
  purchase_order_id VARCHAR(64) NOT NULL,
  from_status VARCHAR(32) NULL,
  to_status VARCHAR(32) NOT NULL,
  changed_by VARCHAR(255) NULL,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT NULL,
  data JSON NULL,
  INDEX idx_wh_po_history_po (purchase_order_id),
  INDEX idx_wh_po_history_status (to_status)
);

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE finance_transactions ADD INDEX idx_finance_tx_amount (amount)', 'SELECT 1') FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'finance_transactions' AND INDEX_NAME = 'idx_finance_tx_amount');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE finance_transactions ADD INDEX idx_finance_tx_status_category (status, category)', 'SELECT 1') FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'finance_transactions' AND INDEX_NAME = 'idx_finance_tx_status_category');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
