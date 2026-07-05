-- Delivery 6: Accounting & Finance Integration
-- Creates normalized finance tables and indexes for income, expenses, budgets,
-- loans, rentals, recurring entries, and payroll postings.

CREATE TABLE IF NOT EXISTS finance_transactions (
  id VARCHAR(64) PRIMARY KEY,
  type VARCHAR(32) NOT NULL,
  category VARCHAR(120) NOT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  transaction_date DATE NOT NULL,
  source VARCHAR(120) NULL,
  reference_type VARCHAR(64) NOT NULL DEFAULT 'manual',
  reference_id VARCHAR(64) NULL,
  description TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'posted',
  attachment_url TEXT NULL,
  created_by VARCHAR(255) NULL,
  approved_by VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data JSON NULL,
  INDEX idx_finance_tx_date (transaction_date),
  INDEX idx_finance_tx_type (type),
  INDEX idx_finance_tx_category (category),
  INDEX idx_finance_tx_status (status),
  UNIQUE KEY uq_finance_reference (reference_type, reference_id)
);

CREATE TABLE IF NOT EXISTS finance_loans (
  id VARCHAR(64) PRIMARY KEY,
  lender_name VARCHAR(180) NOT NULL,
  principal_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  interest_rate DECIMAL(6,3) NOT NULL DEFAULT 0,
  monthly_payment DECIMAL(12,2) NOT NULL DEFAULT 0,
  start_date DATE NULL,
  end_date DATE NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data JSON NULL,
  INDEX idx_finance_loans_status (status),
  INDEX idx_finance_loans_dates (start_date, end_date)
);

CREATE TABLE IF NOT EXISTS finance_rentals (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  monthly_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  due_day INT NOT NULL DEFAULT 1,
  start_date DATE NULL,
  end_date DATE NULL,
  landlord_info TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data JSON NULL,
  INDEX idx_finance_rentals_status (status),
  INDEX idx_finance_rentals_end_date (end_date)
);

CREATE TABLE IF NOT EXISTS finance_budgets (
  id VARCHAR(64) PRIMARY KEY,
  category VARCHAR(120) NOT NULL,
  budget_month CHAR(7) NOT NULL,
  monthly_target DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_finance_budget_category_month (category, budget_month),
  INDEX idx_finance_budgets_month (budget_month)
);

CREATE TABLE IF NOT EXISTS finance_recurring_entries (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  type VARCHAR(32) NOT NULL,
  category VARCHAR(120) NOT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  day_of_month INT NOT NULL DEFAULT 1,
  source VARCHAR(120) NULL,
  description TEXT NULL,
  last_processed_month CHAR(7) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data JSON NULL,
  INDEX idx_finance_recurring_active (is_active)
);
