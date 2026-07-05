-- PowerGym Management - Delivery 2 membership and subscription schema
-- Adds structured backend tables for plans, subscriptions, invoices, and QR/e-card access tokens.

CREATE TABLE IF NOT EXISTS subscription_plans (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  duration_days INT NOT NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  currency VARCHAR(12) NOT NULL DEFAULT 'USD',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data JSON NULL,
  INDEX idx_subscription_plans_status (status)
);

CREATE TABLE IF NOT EXISTS member_subscriptions (
  id VARCHAR(64) PRIMARY KEY,
  member_id VARCHAR(255) NOT NULL,
  plan_id VARCHAR(64) NULL,
  plan_name VARCHAR(120) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  currency VARCHAR(12) NOT NULL DEFAULT 'USD',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data JSON NULL,
  INDEX idx_member_subscriptions_member (member_id),
  INDEX idx_member_subscriptions_dates (start_date, end_date),
  INDEX idx_member_subscriptions_status (status),
  CONSTRAINT fk_member_subscriptions_plan FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS invoices (
  id VARCHAR(64) PRIMARY KEY,
  invoice_number VARCHAR(64) UNIQUE NOT NULL,
  member_id VARCHAR(255) NOT NULL,
  subscription_id VARCHAR(64) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'issued',
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  total DECIMAL(10,2) NOT NULL DEFAULT 0,
  currency VARCHAR(12) NOT NULL DEFAULT 'USD',
  due_date DATE NULL,
  paid_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data JSON NULL,
  INDEX idx_invoices_member (member_id),
  INDEX idx_invoices_subscription (subscription_id),
  INDEX idx_invoices_status (status),
  CONSTRAINT fk_invoices_subscription FOREIGN KEY (subscription_id) REFERENCES member_subscriptions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS access_tokens (
  id VARCHAR(64) PRIMARY KEY,
  member_id VARCHAR(255) NOT NULL,
  token_hash CHAR(64) UNIQUE NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  expires_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  data JSON NULL,
  INDEX idx_access_tokens_member (member_id),
  INDEX idx_access_tokens_hash (token_hash)
);
