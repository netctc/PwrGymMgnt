SET @db = DATABASE();

-- Products: status + updated_at + name
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'warehouse_products' AND COLUMN_NAME = 'updated_at');
SET @idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
            WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'warehouse_products' AND INDEX_NAME = 'idx_wh_products_status_updated_name');
SET @sql = IF(@col > 0 AND @idx = 0, 
              'CREATE INDEX idx_wh_products_status_updated_name ON warehouse_products (status, updated_at, name)', 
              'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Products: status + category_id + updated_at
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'warehouse_products' AND COLUMN_NAME = 'category_id');
SET @idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
            WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'warehouse_products' AND INDEX_NAME = 'idx_wh_products_status_category_updated');
SET @sql = IF(@col > 0 AND @idx = 0, 
              'CREATE INDEX idx_wh_products_status_category_updated ON warehouse_products (status, category_id, updated_at)', 
              'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Suppliers: status + name
SET @idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
            WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'warehouse_suppliers' AND INDEX_NAME = 'idx_wh_suppliers_status_name');
SET @sql = IF(@idx = 0, 
              'CREATE INDEX idx_wh_suppliers_status_name ON warehouse_suppliers (status, name)', 
              'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Purchase orders: status + created_at
SET @idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
            WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'warehouse_purchase_orders' AND INDEX_NAME = 'idx_wh_po_status_created');
SET @sql = IF(@idx = 0, 
              'CREATE INDEX idx_wh_po_status_created ON warehouse_purchase_orders (status, created_at)', 
              'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Purchase orders: supplier_id + created_at
SET @idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
            WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'warehouse_purchase_orders' AND INDEX_NAME = 'idx_wh_po_supplier_created');
SET @sql = IF(@idx = 0, 
              'CREATE INDEX idx_wh_po_supplier_created ON warehouse_purchase_orders (supplier_id, created_at)', 
              'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- POS sales: status + sale_date
SET @idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
            WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'warehouse_pos_sales' AND INDEX_NAME = 'idx_wh_sales_status_date');
SET @sql = IF(@idx = 0, 
              'CREATE INDEX idx_wh_sales_status_date ON warehouse_pos_sales (status, sale_date)', 
              'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- POS sales: payment_method + sale_date
SET @idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
            WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'warehouse_pos_sales' AND INDEX_NAME = 'idx_wh_sales_payment_date');
SET @sql = IF(@idx = 0, 
              'CREATE INDEX idx_wh_sales_payment_date ON warehouse_pos_sales (payment_method, sale_date)', 
              'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
