-- Delivery 47 - Warehouse category management and item/order detail support

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
VALUES ('cat_general', 'General', 'general', NULL, 'Default product category', 'active');

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE warehouse_products ADD COLUMN category_id VARCHAR(64) NULL', 'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_products' AND COLUMN_NAME = 'category_id');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE warehouse_products ADD INDEX idx_wh_products_category_id (category_id)', 'SELECT 1') FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'warehouse_products' AND INDEX_NAME = 'idx_wh_products_category_id');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT IGNORE INTO warehouse_categories (id, name, slug, parent_id, description, status)
SELECT CONCAT('cat_', LOWER(REPLACE(REPLACE(REPLACE(category, ' ', '_'), '/', '_'), '&', 'and'))),
       category,
       LOWER(REPLACE(REPLACE(REPLACE(category, ' ', '-'), '/', '-'), '&', 'and')),
       NULL,
       'Auto-created from existing product category',
       'active'
FROM warehouse_products
WHERE category IS NOT NULL AND TRIM(category) <> '';

UPDATE warehouse_products p
LEFT JOIN warehouse_categories c ON LOWER(c.name) = LOWER(p.category) AND c.status <> 'archived'
SET p.category_id = c.id
WHERE p.category_id IS NULL AND c.id IS NOT NULL;
