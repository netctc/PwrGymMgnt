-- Phase 13: Warehouse, Inventory and POS Integration
-- Non-destructive schema for product catalog, stock movements, purchasing, POS sales and pricing rules.

CREATE TABLE IF NOT EXISTS warehouse_suppliers (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  contact_name VARCHAR(180) NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(80) NULL,
  payment_terms VARCHAR(180) NULL,
  delivery_schedule VARCHAR(180) NULL,
  contract_notes TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data JSON NULL,
  INDEX idx_wh_supplier_status (status),
  INDEX idx_wh_supplier_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS warehouse_products (
  id VARCHAR(64) PRIMARY KEY,
  sku VARCHAR(80) NOT NULL,
  barcode VARCHAR(120) NULL,
  name VARCHAR(180) NOT NULL,
  description TEXT NULL,
  category VARCHAR(120) NOT NULL DEFAULT 'General',
  supplier_id VARCHAR(64) NULL,
  cost_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  retail_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  wholesale_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  member_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  stock_quantity DECIMAL(12,3) NOT NULL DEFAULT 0,
  min_stock DECIMAL(12,3) NOT NULL DEFAULT 0,
  max_stock DECIMAL(12,3) NOT NULL DEFAULT 0,
  unit VARCHAR(32) NOT NULL DEFAULT 'pcs',
  location VARCHAR(120) NOT NULL DEFAULT 'main',
  expiry_date DATE NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data JSON NULL,
  UNIQUE KEY uq_wh_products_sku (sku),
  UNIQUE KEY uq_wh_products_barcode (barcode),
  INDEX idx_wh_products_category (category),
  INDEX idx_wh_products_supplier (supplier_id),
  INDEX idx_wh_products_status (status),
  INDEX idx_wh_products_expiry (expiry_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS warehouse_product_batches (
  id VARCHAR(64) PRIMARY KEY,
  product_id VARCHAR(64) NOT NULL,
  batch_number VARCHAR(120) NULL,
  lot_number VARCHAR(120) NULL,
  serial_number VARCHAR(180) NULL,
  expiry_date DATE NULL,
  quantity DECIMAL(12,3) NOT NULL DEFAULT 0,
  cost_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data JSON NULL,
  INDEX idx_wh_batches_product (product_id),
  INDEX idx_wh_batches_expiry (expiry_date),
  INDEX idx_wh_batches_serial (serial_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS warehouse_stock_movements (
  id VARCHAR(64) PRIMARY KEY,
  product_id VARCHAR(64) NOT NULL,
  movement_type VARCHAR(40) NOT NULL,
  quantity_delta DECIMAL(12,3) NOT NULL,
  unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  stock_before DECIMAL(12,3) NOT NULL DEFAULT 0,
  stock_after DECIMAL(12,3) NOT NULL DEFAULT 0,
  reference_type VARCHAR(80) NULL,
  reference_id VARCHAR(64) NULL,
  reason TEXT NULL,
  performed_by VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  data JSON NULL,
  INDEX idx_wh_movements_product (product_id),
  INDEX idx_wh_movements_created (created_at),
  INDEX idx_wh_movements_ref (reference_type, reference_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS warehouse_purchase_orders (
  id VARCHAR(64) PRIMARY KEY,
  po_number VARCHAR(80) NOT NULL,
  supplier_id VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  order_date DATE NOT NULL,
  expected_date DATE NULL,
  received_date DATE NULL,
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  shipping_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  created_by VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data JSON NULL,
  UNIQUE KEY uq_wh_po_number (po_number),
  INDEX idx_wh_po_supplier (supplier_id),
  INDEX idx_wh_po_status (status),
  INDEX idx_wh_po_dates (order_date, expected_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS warehouse_purchase_order_items (
  id VARCHAR(64) PRIMARY KEY,
  purchase_order_id VARCHAR(64) NOT NULL,
  product_id VARCHAR(64) NOT NULL,
  sku VARCHAR(80) NULL,
  description VARCHAR(255) NULL,
  quantity_ordered DECIMAL(12,3) NOT NULL DEFAULT 0,
  quantity_received DECIMAL(12,3) NOT NULL DEFAULT 0,
  unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  line_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  data JSON NULL,
  INDEX idx_wh_po_items_po (purchase_order_id),
  INDEX idx_wh_po_items_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS warehouse_pos_sales (
  id VARCHAR(64) PRIMARY KEY,
  receipt_number VARCHAR(80) NOT NULL,
  sale_date DATETIME NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'paid',
  cashier VARCHAR(255) NULL,
  member_id VARCHAR(64) NULL,
  customer_name VARCHAR(180) NULL,
  payment_method VARCHAR(40) NOT NULL DEFAULT 'cash',
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  cogs_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  data JSON NULL,
  UNIQUE KEY uq_wh_sale_receipt (receipt_number),
  INDEX idx_wh_sales_date (sale_date),
  INDEX idx_wh_sales_status (status),
  INDEX idx_wh_sales_payment (payment_method)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS warehouse_pos_sale_items (
  id VARCHAR(64) PRIMARY KEY,
  sale_id VARCHAR(64) NOT NULL,
  product_id VARCHAR(64) NOT NULL,
  sku VARCHAR(80) NULL,
  description VARCHAR(255) NULL,
  quantity DECIMAL(12,3) NOT NULL DEFAULT 0,
  unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount DECIMAL(12,2) NOT NULL DEFAULT 0,
  line_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  data JSON NULL,
  INDEX idx_wh_sale_items_sale (sale_id),
  INDEX idx_wh_sale_items_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS warehouse_pricing_rules (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  product_id VARCHAR(64) NULL,
  category VARCHAR(120) NULL,
  price_tier VARCHAR(40) NOT NULL DEFAULT 'retail',
  discount_type VARCHAR(40) NOT NULL DEFAULT 'percentage',
  discount_value DECIMAL(12,2) NOT NULL DEFAULT 0,
  starts_at DATE NULL,
  ends_at DATE NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data JSON NULL,
  INDEX idx_wh_pricing_status_dates (status, starts_at, ends_at),
  INDEX idx_wh_pricing_product (product_id),
  INDEX idx_wh_pricing_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
