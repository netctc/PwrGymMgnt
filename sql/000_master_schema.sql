-- =============================================================================
-- PowerGym Management — MASTER SCHEMA (single source of truth)
-- =============================================================================
-- Generated: 2026-07-02  |  Compatible: MariaDB 10.3+ / MySQL 5.7+
-- All tables use ENGINE=InnoDB, utf8mb4_unicode_ci for FK compatibility.
-- Run with:  npm run db:migrate   (applies 000_master_schema.sql first)
--
-- This file REPLACES migrations 001-023 as the definitive schema definition.
-- The individual migration files are kept for audit history only.
-- On a fresh database, only this file needs to run.
-- On an existing database, run npm run db:migrate normally (all files are
-- guarded with CREATE TABLE IF NOT EXISTS / ALTER TABLE IF NOT EXISTS).
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. AUTHENTICATION & RBAC
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_users (
  id                   INT           AUTO_INCREMENT PRIMARY KEY,
  name                 VARCHAR(255)  NULL,
  email                VARCHAR(255)  NOT NULL,
  username             VARCHAR(100)  NULL,
  employee_id          VARCHAR(64)   NULL,
  password_hash        VARCHAR(255)  NOT NULL,
  role                 VARCHAR(50)   NOT NULL DEFAULT 'admin',
  status               VARCHAR(50)   NOT NULL DEFAULT 'active',
  reset_phone          VARCHAR(32)   NULL,
  reset_delivery_channel VARCHAR(32) NULL,
  last_login_at        DATETIME      NULL,
  password_changed_at  DATETIME      NULL,
  created_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_admin_users_email       (email),
  UNIQUE KEY uq_admin_users_username    (username),
  UNIQUE KEY uq_admin_users_employee_id (employee_id),
  INDEX      idx_admin_users_role       (role),
  INDEX      idx_admin_users_status     (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS role_permission_overrides (
  role           VARCHAR(50)  NOT NULL,
  permission_key VARCHAR(100) NOT NULL,
  allowed        TINYINT(1)   NOT NULL,
  updated_by     VARCHAR(255) NULL,
  updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (role, permission_key),
  INDEX idx_role_permission_key (permission_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id                   VARCHAR(64)  PRIMARY KEY,
  user_id              INT          NOT NULL,
  email                VARCHAR(255) NOT NULL,
  token_hash           CHAR(64)     NOT NULL,
  expires_at           DATETIME     NOT NULL,
  used_at              DATETIME     NULL,
  revoked_at           DATETIME     NULL,
  requested_ip         VARCHAR(64)  NULL,
  requested_user_agent VARCHAR(255) NULL,
  delivery_request_id  VARCHAR(64)  NULL,
  delivery_channel     VARCHAR(32)  NULL,
  delivery_status      VARCHAR(32)  NULL,
  delivery_provider    VARCHAR(64)  NULL,
  delivery_last_error  VARCHAR(512) NULL,
  delivered_at         DATETIME     NULL,
  created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_password_reset_token_hash (token_hash),
  INDEX idx_password_reset_email            (email),
  INDEX idx_password_reset_user             (user_id),
  INDEX idx_password_reset_expires          (expires_at),
  INDEX idx_password_reset_status           (used_at, revoked_at),
  INDEX idx_password_reset_delivery_status  (delivery_status),
  INDEX idx_password_reset_delivery_request (delivery_request_id),
  INDEX idx_password_reset_created_delivery (created_at, delivery_status, delivery_channel),
  CONSTRAINT fk_password_reset_admin_user
    FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. SETTINGS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS settings (
  id         VARCHAR(255) PRIMARY KEY,
  data       JSON         NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed default e-card settings (idempotent)
INSERT INTO settings (id, data) VALUES (
  'general',
  JSON_OBJECT(
    'ecardTitle',           'PowerGym QR e-Card',
    'ecardNote',            'Present this QR e-card at reception for access validation.',
    'ecardBackgroundImage', ''
  )
) ON DUPLICATE KEY UPDATE id = id;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. MEMBERS & MEMBERSHIP
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS members (
  id             VARCHAR(255) PRIMARY KEY,
  first_name     VARCHAR(100) NULL,
  last_name      VARCHAR(100) NULL,
  email          VARCHAR(255) NULL,
  phone          VARCHAR(50)  NULL,
  status         VARCHAR(50)  NOT NULL DEFAULT 'active',
  join_date      DATETIME     NULL,
  plan           VARCHAR(100) NULL,
  qr_code        VARCHAR(255) NULL,
  last_access_at DATETIME     NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data           JSON         NULL,
  INDEX idx_members_status      (status),
  INDEX idx_members_email       (email),
  INDEX idx_members_phone       (phone),
  INDEX idx_members_plan        (plan),
  INDEX idx_members_join_date   (join_date),
  INDEX idx_members_last_access (last_access_at),
  INDEX idx_members_status_created (status, created_at),
  INDEX idx_members_status_plan    (status, plan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subscription_plans (
  id           VARCHAR(64)    PRIMARY KEY,
  name         VARCHAR(120)   NOT NULL,
  description  TEXT           NULL,
  duration_days INT           NOT NULL DEFAULT 30,
  price        DECIMAL(10,2)  NOT NULL DEFAULT 0,
  currency     VARCHAR(12)    NOT NULL DEFAULT 'USD',
  status       VARCHAR(32)    NOT NULL DEFAULT 'active',
  created_at   TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data         JSON           NULL,
  INDEX idx_subscription_plans_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS member_subscriptions (
  id         VARCHAR(64)   PRIMARY KEY,
  member_id  VARCHAR(255)  NOT NULL,
  plan_id    VARCHAR(64)   NULL,
  plan_name  VARCHAR(120)  NOT NULL,
  status     VARCHAR(32)   NOT NULL DEFAULT 'active',
  start_date DATE          NOT NULL,
  end_date   DATE          NOT NULL,
  price      DECIMAL(10,2) NOT NULL DEFAULT 0,
  currency   VARCHAR(12)   NOT NULL DEFAULT 'USD',
  created_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data       JSON          NULL,
  INDEX idx_member_subscriptions_member        (member_id),
  INDEX idx_member_subscriptions_dates         (start_date, end_date),
  INDEX idx_member_subscriptions_status        (status),
  INDEX idx_member_subscriptions_access_lookup (member_id, status, end_date),
  INDEX idx_member_subscriptions_status_end    (status, end_date, member_id),
  CONSTRAINT fk_member_subscriptions_plan
    FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS invoices (
  id              VARCHAR(64)   PRIMARY KEY,
  invoice_number  VARCHAR(64)   NOT NULL,
  member_id       VARCHAR(255)  NOT NULL,
  subscription_id VARCHAR(64)   NULL,
  status          VARCHAR(32)   NOT NULL DEFAULT 'issued',
  subtotal        DECIMAL(10,2) NOT NULL DEFAULT 0,
  tax_amount      DECIMAL(10,2) NOT NULL DEFAULT 0,
  total           DECIMAL(10,2) NOT NULL DEFAULT 0,
  currency        VARCHAR(12)   NOT NULL DEFAULT 'USD',
  due_date        DATE          NULL,
  paid_at         DATETIME      NULL,
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data            JSON          NULL,
  UNIQUE KEY uq_invoices_number          (invoice_number),
  INDEX      idx_invoices_member         (member_id),
  INDEX      idx_invoices_subscription   (subscription_id),
  INDEX      idx_invoices_status         (status),
  INDEX      idx_invoices_member_status  (member_id, status, due_date),
  CONSTRAINT fk_invoices_subscription
    FOREIGN KEY (subscription_id) REFERENCES member_subscriptions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS access_tokens (
  id         VARCHAR(64)  PRIMARY KEY,
  member_id  VARCHAR(255) NOT NULL,
  token_hash CHAR(64)     NOT NULL,
  status     VARCHAR(32)  NOT NULL DEFAULT 'active',
  expires_at DATETIME     NULL,
  revoked_at DATETIME     NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data       JSON         NULL,
  UNIQUE KEY uq_access_tokens_hash            (token_hash),
  INDEX      idx_access_tokens_member         (member_id),
  INDEX      idx_access_tokens_status_expiry  (status, expires_at, revoked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ecard_delivery_logs (
  id            VARCHAR(64)  PRIMARY KEY,
  member_id     VARCHAR(255) NOT NULL,
  token_id      VARCHAR(64)  NULL,
  channel       VARCHAR(32)  NOT NULL,
  recipient     VARCHAR(255) NULL,
  status        VARCHAR(32)  NOT NULL DEFAULT 'pending',
  error_message TEXT         NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data          JSON         NULL,
  INDEX idx_ecard_delivery_member  (member_id),
  INDEX idx_ecard_delivery_channel (channel),
  INDEX idx_ecard_delivery_status  (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. SCHEDULING
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS class_sessions (
  id          VARCHAR(64)  PRIMARY KEY,
  title       VARCHAR(160) NOT NULL,
  trainer_id  VARCHAR(255) NULL,
  trainer_name VARCHAR(160) NULL,
  capacity    INT          NOT NULL DEFAULT 0,
  start_time  DATETIME     NOT NULL,
  end_time    DATETIME     NOT NULL,
  room        VARCHAR(120) NOT NULL DEFAULT 'Main Studio',
  status      VARCHAR(32)  NOT NULL DEFAULT 'scheduled',
  class_type  VARCHAR(80)  NULL,
  level       VARCHAR(80)  NULL,
  branch      VARCHAR(120) NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data        JSON         NULL,
  INDEX idx_class_sessions_time                (start_time, end_time),
  INDEX idx_class_sessions_trainer_time        (trainer_id, start_time),
  INDEX idx_class_sessions_room_time           (room, start_time),
  INDEX idx_class_sessions_status              (status),
  INDEX idx_class_sessions_time_status_trainer (start_time, status, trainer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS class_bookings (
  id           VARCHAR(64)  PRIMARY KEY,
  class_id     VARCHAR(64)  NOT NULL,
  member_id    VARCHAR(255) NOT NULL,
  member_name  VARCHAR(180) NULL,
  status       VARCHAR(32)  NOT NULL DEFAULT 'booked',
  booked_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at DATETIME     NULL,
  data         JSON         NULL,
  UNIQUE KEY uq_class_bookings_active_member (class_id, member_id, status),
  INDEX      idx_class_bookings_class         (class_id),
  INDEX      idx_class_bookings_member        (member_id),
  INDEX      idx_class_bookings_status        (status),
  INDEX      idx_class_bookings_member_status (member_id, status),
  CONSTRAINT fk_class_bookings_session
    FOREIGN KEY (class_id) REFERENCES class_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS private_sessions (
  id           VARCHAR(64)  PRIMARY KEY,
  series_id    VARCHAR(64)  NULL,
  member_id    VARCHAR(255) NOT NULL,
  member_name  VARCHAR(180) NULL,
  trainer_id   VARCHAR(255) NOT NULL,
  trainer_name VARCHAR(180) NULL,
  start_time   DATETIME     NOT NULL,
  end_time     DATETIME     NOT NULL,
  room         VARCHAR(120) NOT NULL DEFAULT 'Main Studio',
  status       VARCHAR(32)  NOT NULL DEFAULT 'scheduled',
  level        VARCHAR(80)  NULL,
  branch       VARCHAR(120) NULL,
  notes        TEXT         NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data         JSON         NULL,
  INDEX idx_private_sessions_time                    (start_time, end_time),
  INDEX idx_private_sessions_trainer_time            (trainer_id, start_time),
  INDEX idx_private_sessions_member_time             (member_id, start_time),
  INDEX idx_private_sessions_room_time               (room, start_time),
  INDEX idx_private_sessions_status                  (status),
  INDEX idx_private_sessions_time_status_trainer     (start_time, status, trainer_id),
  INDEX idx_private_sessions_member_status_time      (member_id, status, start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. HR & PAYROLL
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS employees (
  id                      VARCHAR(64)   PRIMARY KEY,
  employee_code           VARCHAR(64)   NULL,
  first_name              VARCHAR(100)  NOT NULL,
  last_name               VARCHAR(100)  NOT NULL,
  email                   VARCHAR(255)  NULL,
  phone                   VARCHAR(50)   NULL,
  department              VARCHAR(120)  NULL,
  job_title               VARCHAR(120)  NULL,
  employment_status       VARCHAR(32)   NOT NULL DEFAULT 'active',
  contract_type           VARCHAR(80)   NOT NULL DEFAULT 'full-time',
  hire_date               DATE          NULL,
  base_salary             DECIMAL(12,2) NOT NULL DEFAULT 0,
  pay_frequency           VARCHAR(32)   NOT NULL DEFAULT 'monthly',
  allowance_housing       DECIMAL(12,2) NOT NULL DEFAULT 0,
  allowance_transport     DECIMAL(12,2) NOT NULL DEFAULT 0,
  allowance_medical       DECIMAL(12,2) NOT NULL DEFAULT 0,
  deduction_tax           DECIMAL(12,2) NOT NULL DEFAULT 0,
  deduction_insurance     DECIMAL(12,2) NOT NULL DEFAULT 0,
  vacation_days_remaining DECIMAL(6,2)  NOT NULL DEFAULT 0,
  created_at              TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data                    JSON          NULL,
  UNIQUE KEY uq_employees_code   (employee_code),
  INDEX      idx_employees_status     (employment_status),
  INDEX      idx_employees_department (department),
  INDEX      idx_employees_email      (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS employee_attendance (
  id            VARCHAR(64)  PRIMARY KEY,
  employee_id   VARCHAR(64)  NOT NULL,
  employee_name VARCHAR(180) NULL,
  work_date     DATE         NOT NULL,
  check_in      VARCHAR(16)  NULL,
  check_out     VARCHAR(16)  NULL,
  hours_worked  DECIMAL(6,2) NOT NULL DEFAULT 0,
  status        VARCHAR(32)  NOT NULL DEFAULT 'present',
  notes         TEXT         NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data          JSON         NULL,
  UNIQUE KEY uq_attendance_employee_date (employee_id, work_date),
  INDEX      idx_attendance_date         (work_date),
  INDEX      idx_attendance_employee     (employee_id),
  CONSTRAINT fk_attendance_employee
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_runs (
  id               VARCHAR(64)   PRIMARY KEY,
  run_month        CHAR(7)       NOT NULL,
  status           VARCHAR(32)   NOT NULL DEFAULT 'draft',
  employee_count   INT           NOT NULL DEFAULT 0,
  total_base       DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_allowances DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_bonuses    DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_deductions DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_net_pay    DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_by       VARCHAR(255)  NULL,
  approved_by      VARCHAR(255)  NULL,
  paid_at          DATETIME      NULL,
  created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payroll_run_month   (run_month),
  INDEX      idx_payroll_runs_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_items (
  id                   VARCHAR(64)   PRIMARY KEY,
  payroll_run_id       VARCHAR(64)   NOT NULL,
  employee_id          VARCHAR(64)   NOT NULL,
  employee_name        VARCHAR(180)  NOT NULL,
  department           VARCHAR(120)  NULL,
  base_salary          DECIMAL(12,2) NOT NULL DEFAULT 0,
  allowances           DECIMAL(12,2) NOT NULL DEFAULT 0,
  bonus                DECIMAL(12,2) NOT NULL DEFAULT 0,
  deductions           DECIMAL(12,2) NOT NULL DEFAULT 0,
  attendance_deduction DECIMAL(12,2) NOT NULL DEFAULT 0,
  net_pay              DECIMAL(12,2) NOT NULL DEFAULT 0,
  status               VARCHAR(32)   NOT NULL DEFAULT 'draft',
  paid_at              DATETIME      NULL,
  data                 JSON          NULL,
  INDEX idx_payroll_items_run              (payroll_run_id),
  INDEX idx_payroll_items_employee         (employee_id),
  INDEX idx_payroll_items_employee_status  (employee_id, status),
  CONSTRAINT fk_payroll_items_run
    FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
  CONSTRAINT fk_payroll_items_employee
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. FINANCE & ACCOUNTING
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS finance_transactions (
  id               VARCHAR(64)   PRIMARY KEY,
  type             VARCHAR(32)   NOT NULL,
  category         VARCHAR(120)  NOT NULL,
  amount           DECIMAL(12,2) NOT NULL DEFAULT 0,
  transaction_date DATE          NOT NULL,
  source           VARCHAR(120)  NULL,
  reference_type   VARCHAR(64)   NOT NULL DEFAULT 'manual',
  reference_id     VARCHAR(64)   NULL,
  description      TEXT          NULL,
  status           VARCHAR(32)   NOT NULL DEFAULT 'posted',
  attachment_url   TEXT          NULL,
  created_by       VARCHAR(255)  NULL,
  approved_by      VARCHAR(255)  NULL,
  created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data             JSON          NULL,
  UNIQUE KEY uq_finance_reference         (reference_type, reference_id),
  INDEX      idx_finance_tx_date          (transaction_date),
  INDEX      idx_finance_tx_type          (type),
  INDEX      idx_finance_tx_category      (category),
  INDEX      idx_finance_tx_status        (status),
  INDEX      idx_finance_tx_amount        (amount),
  INDEX      idx_finance_tx_status_cat    (status, category),
  INDEX      idx_finance_tx_type_status   (type, status, transaction_date),
  INDEX      idx_finance_tx_date_status   (transaction_date, status, type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS finance_loans (
  id               VARCHAR(64)   PRIMARY KEY,
  lender_name      VARCHAR(180)  NOT NULL,
  principal_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  interest_rate    DECIMAL(6,3)  NOT NULL DEFAULT 0,
  monthly_payment  DECIMAL(12,2) NOT NULL DEFAULT 0,
  start_date       DATE          NULL,
  end_date         DATE          NULL,
  status           VARCHAR(32)   NOT NULL DEFAULT 'active',
  notes            TEXT          NULL,
  created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data             JSON          NULL,
  INDEX idx_finance_loans_status (status),
  INDEX idx_finance_loans_dates  (start_date, end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finance_rentals (
  id            VARCHAR(64)   PRIMARY KEY,
  name          VARCHAR(180)  NOT NULL,
  monthly_cost  DECIMAL(12,2) NOT NULL DEFAULT 0,
  due_day       INT           NOT NULL DEFAULT 1,
  start_date    DATE          NULL,
  end_date      DATE          NULL,
  landlord_info TEXT          NULL,
  status        VARCHAR(32)   NOT NULL DEFAULT 'active',
  notes         TEXT          NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data          JSON          NULL,
  INDEX idx_finance_rentals_status   (status),
  INDEX idx_finance_rentals_end_date (end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finance_budgets (
  id             VARCHAR(64)   PRIMARY KEY,
  category       VARCHAR(120)  NOT NULL,
  budget_month   CHAR(7)       NOT NULL,
  monthly_target DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_finance_budget_category_month (category, budget_month),
  INDEX      idx_finance_budgets_month        (budget_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finance_recurring_entries (
  id                   VARCHAR(64)   PRIMARY KEY,
  name                 VARCHAR(180)  NOT NULL,
  type                 VARCHAR(32)   NOT NULL,
  category             VARCHAR(120)  NOT NULL,
  amount               DECIMAL(12,2) NOT NULL DEFAULT 0,
  day_of_month         INT           NOT NULL DEFAULT 1,
  source               VARCHAR(120)  NULL,
  description          TEXT          NULL,
  last_processed_month CHAR(7)       NULL,
  is_active            TINYINT(1)    NOT NULL DEFAULT 1,
  created_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data                 JSON          NULL,
  INDEX idx_finance_recurring_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. WAREHOUSE & POS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS warehouse_suppliers (
  id                VARCHAR(64)  PRIMARY KEY,
  name              VARCHAR(180) NOT NULL,
  contact_name      VARCHAR(180) NULL,
  email             VARCHAR(255) NULL,
  phone             VARCHAR(80)  NULL,
  payment_terms     VARCHAR(180) NULL,
  delivery_schedule VARCHAR(180) NULL,
  contract_notes    TEXT         NULL,
  status            VARCHAR(32)  NOT NULL DEFAULT 'active',
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data              JSON         NULL,
  INDEX idx_wh_supplier_status      (status),
  INDEX idx_wh_supplier_name        (name),
  INDEX idx_wh_suppliers_status_name (status, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS warehouse_categories (
  id          VARCHAR(64)  PRIMARY KEY,
  name        VARCHAR(160) NOT NULL,
  slug        VARCHAR(180) NOT NULL,
  parent_id   VARCHAR(64)  NULL,
  description TEXT         NULL,
  status      VARCHAR(32)  NOT NULL DEFAULT 'active',
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data        JSON         NULL,
  UNIQUE KEY uq_wh_category_slug   (slug),
  INDEX      idx_wh_category_parent (parent_id),
  INDEX      idx_wh_category_status (status),
  INDEX      idx_wh_category_name   (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO warehouse_categories (id, name, slug, status) VALUES
  ('cat_general',     'General',     'general',     'active'),
  ('cat_apparel',     'Apparel',     'apparel',     'active'),
  ('cat_equipment',   'Equipment',   'equipment',   'active'),
  ('cat_supplements', 'Supplements', 'supplements', 'active');

CREATE TABLE IF NOT EXISTS warehouse_products (
  id             VARCHAR(64)    PRIMARY KEY,
  sku            VARCHAR(80)    NOT NULL,
  barcode        VARCHAR(120)   NULL,
  name           VARCHAR(180)   NOT NULL,
  description    TEXT           NULL,
  category       VARCHAR(120)   NOT NULL DEFAULT 'General',
  category_id    VARCHAR(64)    NULL,
  supplier_id    VARCHAR(64)    NULL,
  cost_price     DECIMAL(12,2)  NOT NULL DEFAULT 0,
  retail_price   DECIMAL(12,2)  NOT NULL DEFAULT 0,
  wholesale_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  member_price   DECIMAL(12,2)  NOT NULL DEFAULT 0,
  stock_quantity DECIMAL(12,3)  NOT NULL DEFAULT 0,
  min_stock      DECIMAL(12,3)  NOT NULL DEFAULT 0,
  max_stock      DECIMAL(12,3)  NOT NULL DEFAULT 0,
  unit           VARCHAR(32)    NOT NULL DEFAULT 'pcs',
  location       VARCHAR(120)   NOT NULL DEFAULT 'main',
  expiry_date    DATE           NULL,
  image_url      TEXT           NULL,
  status         VARCHAR(32)    NOT NULL DEFAULT 'active',
  created_at     TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data           JSON           NULL,
  UNIQUE KEY uq_wh_products_sku                  (sku),
  UNIQUE KEY uq_wh_products_barcode              (barcode),
  INDEX      idx_wh_products_category            (category),
  INDEX      idx_wh_products_category_id         (category_id),
  INDEX      idx_wh_products_supplier            (supplier_id),
  INDEX      idx_wh_products_status              (status),
  INDEX      idx_wh_products_expiry              (expiry_date),
  INDEX      idx_wh_products_status_updated_name (status, updated_at, name),
  INDEX      idx_wh_products_status_cat_updated  (status, category_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS warehouse_product_batches (
  id            VARCHAR(64)   PRIMARY KEY,
  product_id    VARCHAR(64)   NOT NULL,
  batch_number  VARCHAR(120)  NULL,
  lot_number    VARCHAR(120)  NULL,
  serial_number VARCHAR(180)  NULL,
  expiry_date   DATE          NULL,
  quantity      DECIMAL(12,3) NOT NULL DEFAULT 0,
  cost_price    DECIMAL(12,2) NOT NULL DEFAULT 0,
  status        VARCHAR(32)   NOT NULL DEFAULT 'active',
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data          JSON          NULL,
  INDEX idx_wh_batches_product (product_id),
  INDEX idx_wh_batches_expiry  (expiry_date),
  INDEX idx_wh_batches_serial  (serial_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS warehouse_stock_movements (
  id             VARCHAR(64)   PRIMARY KEY,
  product_id     VARCHAR(64)   NOT NULL,
  movement_type  VARCHAR(40)   NOT NULL,
  quantity_delta DECIMAL(12,3) NOT NULL,
  unit_cost      DECIMAL(12,2) NOT NULL DEFAULT 0,
  stock_before   DECIMAL(12,3) NOT NULL DEFAULT 0,
  stock_after    DECIMAL(12,3) NOT NULL DEFAULT 0,
  reference_type VARCHAR(80)   NULL,
  reference_id   VARCHAR(64)   NULL,
  reason         TEXT          NULL,
  performed_by   VARCHAR(255)  NULL,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data           JSON          NULL,
  INDEX idx_wh_movements_product (product_id),
  INDEX idx_wh_movements_created (created_at),
  INDEX idx_wh_movements_ref     (reference_type, reference_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS warehouse_purchase_orders (
  id             VARCHAR(64)   PRIMARY KEY,
  po_number      VARCHAR(80)   NOT NULL,
  supplier_id    VARCHAR(64)   NOT NULL,
  status         VARCHAR(32)   NOT NULL DEFAULT 'pending',
  order_date     DATE          NOT NULL,
  expected_date  DATE          NULL,
  received_date  DATE          NULL,
  subtotal       DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_total      DECIMAL(12,2) NOT NULL DEFAULT 0,
  shipping_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  total          DECIMAL(12,2) NOT NULL DEFAULT 0,
  notes          TEXT          NULL,
  shipped_at     DATETIME      NULL,
  received_at    DATETIME      NULL,
  invoiced_at    DATETIME      NULL,
  created_by     VARCHAR(255)  NULL,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data           JSON          NULL,
  UNIQUE KEY uq_wh_po_number         (po_number),
  INDEX      idx_wh_po_supplier      (supplier_id),
  INDEX      idx_wh_po_status        (status),
  INDEX      idx_wh_po_dates         (order_date, expected_date),
  INDEX      idx_wh_po_status_created   (status, created_at),
  INDEX      idx_wh_po_supplier_created (supplier_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS warehouse_purchase_order_items (
  id                VARCHAR(64)   PRIMARY KEY,
  purchase_order_id VARCHAR(64)   NOT NULL,
  product_id        VARCHAR(64)   NOT NULL,
  sku               VARCHAR(80)   NULL,
  description       VARCHAR(255)  NULL,
  quantity_ordered  DECIMAL(12,3) NOT NULL DEFAULT 0,
  quantity_received DECIMAL(12,3) NOT NULL DEFAULT 0,
  unit_cost         DECIMAL(12,2) NOT NULL DEFAULT 0,
  line_total        DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data              JSON          NULL,
  INDEX idx_wh_po_items_po      (purchase_order_id),
  INDEX idx_wh_po_items_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS warehouse_purchase_order_status_history (
  id                VARCHAR(64)  PRIMARY KEY,
  purchase_order_id VARCHAR(64)  NOT NULL,
  from_status       VARCHAR(32)  NULL,
  to_status         VARCHAR(32)  NOT NULL,
  changed_by        VARCHAR(255) NULL,
  changed_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes             TEXT         NULL,
  data              JSON         NULL,
  INDEX idx_wh_po_history_po     (purchase_order_id),
  INDEX idx_wh_po_history_status (to_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS warehouse_pos_sales (
  id             VARCHAR(64)   PRIMARY KEY,
  receipt_number VARCHAR(80)   NOT NULL,
  sale_date      DATETIME      NOT NULL,
  status         VARCHAR(32)   NOT NULL DEFAULT 'paid',
  cashier        VARCHAR(255)  NULL,
  member_id      VARCHAR(64)   NULL,
  customer_name  VARCHAR(180)  NULL,
  payment_method VARCHAR(40)   NOT NULL DEFAULT 'cash',
  subtotal       DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_total      DECIMAL(12,2) NOT NULL DEFAULT 0,
  total          DECIMAL(12,2) NOT NULL DEFAULT 0,
  cogs_total     DECIMAL(12,2) NOT NULL DEFAULT 0,
  notes          TEXT          NULL,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data           JSON          NULL,
  UNIQUE KEY uq_wh_sale_receipt      (receipt_number),
  INDEX      idx_wh_sales_date       (sale_date),
  INDEX      idx_wh_sales_status     (status),
  INDEX      idx_wh_sales_payment    (payment_method),
  INDEX      idx_wh_sales_status_date   (status, sale_date),
  INDEX      idx_wh_sales_payment_date  (payment_method, sale_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS warehouse_pos_sale_items (
  id          VARCHAR(64)   PRIMARY KEY,
  sale_id     VARCHAR(64)   NOT NULL,
  product_id  VARCHAR(64)   NOT NULL,
  sku         VARCHAR(80)   NULL,
  description VARCHAR(255)  NULL,
  quantity    DECIMAL(12,3) NOT NULL DEFAULT 0,
  unit_price  DECIMAL(12,2) NOT NULL DEFAULT 0,
  unit_cost   DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount    DECIMAL(12,2) NOT NULL DEFAULT 0,
  line_total  DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data        JSON          NULL,
  INDEX idx_wh_sale_items_sale    (sale_id),
  INDEX idx_wh_sale_items_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS warehouse_pricing_rules (
  id             VARCHAR(64)   PRIMARY KEY,
  name           VARCHAR(180)  NOT NULL,
  product_id     VARCHAR(64)   NULL,
  category       VARCHAR(120)  NULL,
  price_tier     VARCHAR(40)   NOT NULL DEFAULT 'retail',
  discount_type  VARCHAR(40)   NOT NULL DEFAULT 'percentage',
  discount_value DECIMAL(12,2) NOT NULL DEFAULT 0,
  starts_at      DATE          NULL,
  ends_at        DATE          NULL,
  status         VARCHAR(32)   NOT NULL DEFAULT 'active',
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data           JSON          NULL,
  INDEX idx_wh_pricing_status_dates (status, starts_at, ends_at),
  INDEX idx_wh_pricing_product      (product_id),
  INDEX idx_wh_pricing_category     (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. SUPPORT & NOTIFICATIONS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS support_tickets (
  id              VARCHAR(64)  PRIMARY KEY,
  ticket_number   VARCHAR(32)  NOT NULL,
  requester_name  VARCHAR(160) NOT NULL,
  requester_email VARCHAR(255) NOT NULL,
  requester_phone VARCHAR(50)  NULL,
  inquiry_type    VARCHAR(40)  NOT NULL DEFAULT 'technical',
  priority        VARCHAR(20)  NOT NULL DEFAULT 'normal',
  subject         VARCHAR(180) NOT NULL,
  description     TEXT         NOT NULL,
  status          VARCHAR(32)  NOT NULL DEFAULT 'open',
  assigned_to     VARCHAR(255) NULL,
  created_by      VARCHAR(255) NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  resolved_at     DATETIME     NULL,
  data            JSON         NULL,
  UNIQUE KEY uq_support_ticket_number          (ticket_number),
  INDEX      idx_support_tickets_status        (status),
  INDEX      idx_support_tickets_type          (inquiry_type),
  INDEX      idx_support_tickets_created_at    (created_at),
  INDEX      idx_support_tickets_requester_email (requester_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id          VARCHAR(64)  PRIMARY KEY,
  ticket_id   VARCHAR(64)  NOT NULL,
  author_email VARCHAR(255) NULL,
  author_role VARCHAR(64)  NULL,
  message     TEXT         NOT NULL,
  visibility  VARCHAR(32)  NOT NULL DEFAULT 'public',
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data        JSON         NULL,
  INDEX idx_support_ticket_messages_ticket (ticket_id),
  CONSTRAINT fk_support_messages_ticket
    FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id         VARCHAR(64)  PRIMARY KEY,
  user_id    VARCHAR(255) NULL,
  role       VARCHAR(64)  NULL,
  title      VARCHAR(180) NOT NULL,
  body       TEXT         NOT NULL,
  type       VARCHAR(64)  NOT NULL DEFAULT 'info',
  channel    VARCHAR(64)  NOT NULL DEFAULT 'in_app',
  link_url   VARCHAR(255) NULL,
  read_at    DATETIME     NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME     NULL,
  data       JSON         NULL,
  INDEX idx_notifications_user_read  (user_id, read_at),
  INDEX idx_notifications_role_read  (role, read_at),
  INDEX idx_notifications_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id          VARCHAR(255) PRIMARY KEY,
  in_app_enabled   TINYINT(1)   NOT NULL DEFAULT 1,
  email_enabled    TINYINT(1)   NOT NULL DEFAULT 1,
  whatsapp_enabled TINYINT(1)   NOT NULL DEFAULT 0,
  class_reminders  TINYINT(1)   NOT NULL DEFAULT 1,
  billing_reminders TINYINT(1)  NOT NULL DEFAULT 1,
  support_updates  TINYINT(1)   NOT NULL DEFAULT 1,
  updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data             JSON         NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. SECURITY & AUDIT
-- ─────────────────────────────────────────────────────────────────────────────

-- Legacy compatibility tables (used by Staff/Settings/Dashboard routes)
CREATE TABLE IF NOT EXISTS users (
  id         VARCHAR(255) PRIMARY KEY,
  email      VARCHAR(255) NULL,
  role       VARCHAR(100) NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data       JSON         NULL,
  INDEX idx_users_email (email),
  INDEX idx_users_role  (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS staff (
  id         VARCHAR(255) PRIMARY KEY,
  first_name VARCHAR(100) NULL,
  last_name  VARCHAR(100) NULL,
  email      VARCHAR(255) NULL,
  role       VARCHAR(100) NULL,
  status     VARCHAR(50)  NOT NULL DEFAULT 'active',
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data       JSON         NULL,
  INDEX idx_staff_email  (email),
  INDEX idx_staff_role   (role),
  INDEX idx_staff_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shifts (
  id         VARCHAR(255) PRIMARY KEY,
  data       JSON         NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS appSettings (
  id         VARCHAR(255) PRIMARY KEY,
  data       JSON         NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id           INT          AUTO_INCREMENT PRIMARY KEY,
  action       VARCHAR(255) NOT NULL,
  details      TEXT         NULL,
  performed_by VARCHAR(255) NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_logs_action      (action),
  INDEX idx_audit_logs_created_at  (created_at),
  INDEX idx_audit_logs_performed_by (performed_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS security_audit_events (
  id           BIGINT       AUTO_INCREMENT PRIMARY KEY,
  request_id   VARCHAR(80)  NULL,
  actor_id     VARCHAR(255) NULL,
  actor_email  VARCHAR(255) NULL,
  actor_role   VARCHAR(80)  NULL,
  method       VARCHAR(16)  NOT NULL,
  path         VARCHAR(512) NOT NULL,
  module       VARCHAR(80)  NOT NULL DEFAULT 'core',
  action       VARCHAR(80)  NOT NULL DEFAULT 'request',
  status_code  INT          NOT NULL DEFAULT 0,
  duration_ms  INT          NOT NULL DEFAULT 0,
  ip_address   VARCHAR(128) NULL,
  user_agent   TEXT         NULL,
  severity     VARCHAR(32)  NOT NULL DEFAULT 'info',
  metadata     JSON         NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_security_audit_created              (created_at),
  INDEX idx_security_audit_actor                (actor_email),
  INDEX idx_security_audit_module               (module),
  INDEX idx_security_audit_status               (status_code),
  INDEX idx_security_audit_request              (request_id),
  INDEX idx_security_audit_range_status         (created_at, status_code),
  INDEX idx_security_audit_range_module_severity (created_at, module, severity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. DATA INTEGRITY TRACKING
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS data_integrity_runs (
  id              VARCHAR(64)  PRIMARY KEY,
  posture         VARCHAR(32)  NOT NULL,
  total_checks    INT          NOT NULL DEFAULT 0,
  failing_checks  INT          NOT NULL DEFAULT 0,
  critical_checks INT          NOT NULL DEFAULT 0,
  warning_checks  INT          NOT NULL DEFAULT 0,
  affected_rows   INT          NOT NULL DEFAULT 0,
  generated_by    VARCHAR(255) NULL,
  summary         JSON         NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_data_integrity_runs_created  (created_at),
  INDEX idx_data_integrity_runs_posture  (posture)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================================
-- END OF MASTER SCHEMA
-- =============================================================================
