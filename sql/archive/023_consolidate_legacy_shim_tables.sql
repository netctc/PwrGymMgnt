-- Migration 023: Consolidate Legacy Shim Tables
-- Purpose: eliminate duplication introduced by the original Firestore-to-MySQL
--   compatibility layer. The legacy tables (users, plans, subscriptions, classes,
--   hr, accounting, staff, appSettings) are replaced by their typed counterparts.
--
-- This migration is NON-DESTRUCTIVE by default:
--   - Data is migrated with INSERT IGNORE so it never overwrites canonical records.
--   - Legacy tables are RENAMED to _legacy_<name> for inspection/rollback.
--   - To permanently drop them run: 023b_drop_legacy_shim_tables.manual.sql
--
-- Run order: after all previous migrations (001-022).

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET @schema_name = DATABASE();

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Ensure admin_users has all columns from 021 (safe on any DB state)
-- ─────────────────────────────────────────────────────────────────────────────
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='admin_users' AND COLUMN_NAME='name');
SET @s = IF(@c=0,'ALTER TABLE admin_users ADD COLUMN name VARCHAR(255) NULL AFTER id','SELECT 1');
PREPARE _s FROM @s; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='admin_users' AND COLUMN_NAME='username');
SET @s = IF(@c=0,'ALTER TABLE admin_users ADD COLUMN username VARCHAR(100) NULL','SELECT 1');
PREPARE _s FROM @s; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='admin_users' AND COLUMN_NAME='status');
SET @s = IF(@c=0,'ALTER TABLE admin_users ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT ''active''','SELECT 1');
PREPARE _s FROM @s; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='admin_users' AND COLUMN_NAME='reset_phone');
SET @s = IF(@c=0,'ALTER TABLE admin_users ADD COLUMN reset_phone VARCHAR(32) NULL','SELECT 1');
PREPARE _s FROM @s; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='admin_users' AND COLUMN_NAME='reset_delivery_channel');
SET @s = IF(@c=0,'ALTER TABLE admin_users ADD COLUMN reset_delivery_channel VARCHAR(32) NULL','SELECT 1');
PREPARE _s FROM @s; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='admin_users' AND COLUMN_NAME='last_login_at');
SET @s = IF(@c=0,'ALTER TABLE admin_users ADD COLUMN last_login_at DATETIME NULL','SELECT 1');
PREPARE _s FROM @s; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='admin_users' AND COLUMN_NAME='password_changed_at');
SET @s = IF(@c=0,'ALTER TABLE admin_users ADD COLUMN password_changed_at DATETIME NULL','SELECT 1');
PREPARE _s FROM @s; EXECUTE _s; DEALLOCATE PREPARE _s;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. appSettings → settings
-- ─────────────────────────────────────────────────────────────────────────────
SET @has_appSettings = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'appSettings'
);

SET @has_settings = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'settings'
);

-- Ensure the canonical settings table exists
CREATE TABLE IF NOT EXISTS settings (
  id VARCHAR(255) PRIMARY KEY,
  data JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migrate appSettings rows that do not already exist in settings
SET @sql = IF(
  @has_appSettings > 0,
  'INSERT IGNORE INTO settings (id, data, created_at, updated_at)
   SELECT id, data, COALESCE(created_at, NOW()), COALESCE(updated_at, NOW())
   FROM appSettings',
  'SELECT 1 -- appSettings table does not exist, skip'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Rename appSettings to legacy archive
SET @sql = IF(
  @has_appSettings > 0,
  'RENAME TABLE appSettings TO _legacy_appSettings',
  'SELECT 1 -- appSettings table does not exist, skip'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. plans → subscription_plans
--    Migrate plans rows that do not already have a match in subscription_plans.
-- ─────────────────────────────────────────────────────────────────────────────
SET @has_plans = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'plans'
);

CREATE TABLE IF NOT EXISTS subscription_plans (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  duration_days INT NOT NULL DEFAULT 30,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  currency VARCHAR(12) NOT NULL DEFAULT 'USD',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data JSON NULL,
  INDEX idx_subscription_plans_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @sql = IF(
  @has_plans > 0,
  'INSERT IGNORE INTO subscription_plans (id, name, duration_days, price, status, created_at, updated_at, data)
   SELECT
     p.id,
     COALESCE(NULLIF(p.name, ""), "Unnamed Plan") AS name,
     COALESCE(p.duration_days, 30)                AS duration_days,
     COALESCE(p.price, 0)                         AS price,
     COALESCE(NULLIF(p.status, ""), "active")      AS status,
     COALESCE(p.created_at, NOW()),
     COALESCE(p.updated_at, NOW()),
     p.data
   FROM plans p
   WHERE p.id NOT IN (SELECT id FROM subscription_plans)',
  'SELECT 1 -- plans table does not exist, skip'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  @has_plans > 0,
  'RENAME TABLE plans TO _legacy_plans',
  'SELECT 1 -- plans table does not exist, skip'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. subscriptions → member_subscriptions
--    Legacy subscriptions have amount/plan_id; canonical has price/plan_name.
--    Migrate orphan rows that are not already in member_subscriptions.
-- ─────────────────────────────────────────────────────────────────────────────
SET @has_subscriptions = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'subscriptions'
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
  INDEX idx_member_subscriptions_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @sql = IF(
  @has_subscriptions > 0,
  'INSERT IGNORE INTO member_subscriptions
     (id, member_id, plan_id, plan_name, status, start_date, end_date, price, currency, created_at, updated_at, data)
   SELECT
     s.id,
     s.member_id,
     s.plan_id,
     COALESCE(
       NULLIF(JSON_UNQUOTE(JSON_EXTRACT(s.data, "$.planName")), ""),
       sp.name,
       m.plan,
       "Subscription"
     )                                              AS plan_name,
     COALESCE(NULLIF(LOWER(TRIM(s.status)), ""), "active") AS status,
     COALESCE(DATE(s.start_date), CURDATE())        AS start_date,
     COALESCE(DATE(s.end_date),   CURDATE())        AS end_date,
     COALESCE(s.amount, sp.price, 0)                AS price,
     COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(s.data, "$.currency")), ""), "USD") AS currency,
     COALESCE(s.created_at, NOW()),
     COALESCE(s.updated_at, NOW()),
     s.data
   FROM subscriptions s
   LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
   LEFT JOIN members m             ON m.id  = s.member_id
   WHERE s.id NOT IN (SELECT id FROM member_subscriptions)',
  'SELECT 1 -- subscriptions table does not exist, skip'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  @has_subscriptions > 0,
  'RENAME TABLE subscriptions TO _legacy_subscriptions',
  'SELECT 1 -- subscriptions table does not exist, skip'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. classes → class_sessions
--    Migrate legacy classes rows that do not already exist in class_sessions.
-- ─────────────────────────────────────────────────────────────────────────────
SET @has_classes = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'classes'
);

CREATE TABLE IF NOT EXISTS class_sessions (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(160) NOT NULL DEFAULT 'Class',
  trainer_id VARCHAR(255) NULL,
  trainer_name VARCHAR(160) NULL,
  capacity INT NOT NULL DEFAULT 0,
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  room VARCHAR(120) NOT NULL DEFAULT 'Main Studio',
  status VARCHAR(32) NOT NULL DEFAULT 'scheduled',
  class_type VARCHAR(80) NULL,
  level VARCHAR(80) NULL,
  branch VARCHAR(120) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data JSON NULL,
  INDEX idx_class_sessions_time (start_time, end_time),
  INDEX idx_class_sessions_trainer_time (trainer_id, start_time),
  INDEX idx_class_sessions_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @sql = IF(
  @has_classes > 0,
  'INSERT IGNORE INTO class_sessions
     (id, title, trainer_id, capacity, start_time, end_time, room, status, created_at, updated_at, data)
   SELECT
     c.id,
     COALESCE(NULLIF(c.name, ""), "Class")         AS title,
     c.instructor_id                                AS trainer_id,
     COALESCE(c.capacity, 0)                        AS capacity,
     COALESCE(c.start_time, NOW())                  AS start_time,
     COALESCE(c.end_time,   DATE_ADD(COALESCE(c.start_time, NOW()), INTERVAL 1 HOUR)) AS end_time,
     COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.data, "$.room")), ""), "Main Studio") AS room,
     COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.data, "$.status")), ""), "scheduled") AS status,
     COALESCE(c.created_at, NOW()),
     COALESCE(c.updated_at, NOW()),
     c.data
   FROM classes c
   WHERE c.id NOT IN (SELECT id FROM class_sessions)',
  'SELECT 1 -- classes table does not exist, skip'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  @has_classes > 0,
  'RENAME TABLE classes TO _legacy_classes',
  'SELECT 1 -- classes table does not exist, skip'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. hr → finance_transactions / payroll (generic blob rows)
--    The `hr` table was a catch-all JSON blob. Any rows that are payroll-related
--    get migrated into finance_transactions as a payroll expense reference.
--    Generic rows with no recognisable type are archived only.
-- ─────────────────────────────────────────────────────────────────────────────
SET @has_hr_legacy = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'hr'
);

SET @sql = IF(
  @has_hr_legacy > 0,
  'INSERT IGNORE INTO finance_transactions
     (id, type, category, amount, transaction_date, source, reference_type, reference_id, description, status, created_at, updated_at, data)
   SELECT
     CONCAT("legacy_hr_", h.id)                          AS id,
     "expense"                                            AS type,
     COALESCE(NULLIF(h.type, ""), "HR Legacy")            AS category,
     COALESCE(h.amount, 0)                                AS amount,
     COALESCE(DATE(h.date), CURDATE())                    AS transaction_date,
     "hr_legacy"                                          AS source,
     "hr_legacy"                                          AS reference_type,
     h.id                                                 AS reference_id,
     COALESCE(h.notes, "Migrated from legacy hr table")   AS description,
     "posted"                                             AS status,
     COALESCE(h.created_at, NOW()),
     COALESCE(h.created_at, NOW()),
     h.data
   FROM hr h
   WHERE CONCAT("legacy_hr_", h.id) NOT IN (SELECT id FROM finance_transactions)',
  'SELECT 1 -- hr table does not exist, skip'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  @has_hr_legacy > 0,
  'RENAME TABLE hr TO _legacy_hr',
  'SELECT 1 -- hr table does not exist, skip'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. accounting → finance_transactions
--    The `accounting` table was a generic blob. Migrate into finance_transactions.
-- ─────────────────────────────────────────────────────────────────────────────
SET @has_accounting = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'accounting'
);

SET @sql = IF(
  @has_accounting > 0,
  'INSERT IGNORE INTO finance_transactions
     (id, type, category, amount, transaction_date, source, reference_type, reference_id, description, status, created_at, updated_at, data)
   SELECT
     CONCAT("legacy_acc_", a.id)                          AS id,
     COALESCE(
       CASE WHEN LOWER(COALESCE(a.transaction_type,"")) IN ("income","revenue","credit") THEN "income"
            WHEN LOWER(COALESCE(a.transaction_type,"")) IN ("expense","debit","cost")    THEN "expense"
            ELSE "expense" END,
       "expense"
     )                                                     AS type,
     COALESCE(NULLIF(a.category, ""), "Accounting Legacy") AS category,
     COALESCE(a.amount, 0)                                 AS amount,
     COALESCE(DATE(a.date), CURDATE())                     AS transaction_date,
     "accounting_legacy"                                   AS source,
     "accounting_legacy"                                   AS reference_type,
     a.id                                                  AS reference_id,
     COALESCE(a.description, "Migrated from legacy accounting table") AS description,
     "posted"                                              AS status,
     COALESCE(a.created_at, NOW()),
     COALESCE(a.created_at, NOW()),
     a.data
   FROM accounting a
   WHERE CONCAT("legacy_acc_", a.id) NOT IN (SELECT id FROM finance_transactions)',
  'SELECT 1 -- accounting table does not exist, skip'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  @has_accounting > 0,
  'RENAME TABLE accounting TO _legacy_accounting',
  'SELECT 1 -- accounting table does not exist, skip'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. staff → employees (link / migrate)
--    staff rows that have NO matching employee (by email) get a thin employee
--    record created so they are accessible via the HR module.
--    staff rows already linked to an admin_user via matching email are just
--    archived — their data lives in employees/admin_users.
-- ─────────────────────────────────────────────────────────────────────────────
SET @has_staff = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'staff'
);

SET @sql = IF(
  @has_staff > 0,
  'INSERT IGNORE INTO employees
     (id, first_name, last_name, email, employment_status, job_title, created_at, updated_at, data)
   SELECT
     s.id,
     COALESCE(NULLIF(s.first_name, ""), "Unknown")   AS first_name,
     COALESCE(s.last_name, "")                        AS last_name,
     s.email,
     CASE WHEN LOWER(COALESCE(s.status,"")) = "active" THEN "active" ELSE "inactive" END AS employment_status,
     COALESCE(NULLIF(s.role, ""), "staff")            AS job_title,
     COALESCE(s.created_at, NOW()),
     COALESCE(s.updated_at, NOW()),
     s.data
   FROM staff s
   WHERE s.id NOT IN (SELECT id FROM employees)
     AND (s.email IS NULL OR s.email NOT IN (SELECT COALESCE(email,"") FROM employees WHERE email IS NOT NULL))',
  'SELECT 1 -- staff table does not exist, skip'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  @has_staff > 0,
  'RENAME TABLE staff TO _legacy_staff',
  'SELECT 1 -- staff table does not exist, skip'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. users → admin_users (link / migrate)
--    The `users` table stored Firebase/Firestore user blobs. Staff-role users
--    that don't already have an admin_users account get a stub account so the
--    login system can adopt them.
--    NOTE: password_hash is set to a random locked value — the user must
--    trigger password-reset before first login.
-- ─────────────────────────────────────────────────────────────────────────────
SET @has_users = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'users'
);

SET @sql = IF(
  @has_users > 0,
  'INSERT IGNORE INTO admin_users
     (email, password_hash, role, status, created_at, updated_at)
   SELECT
     LOWER(TRIM(u.email))                                       AS email,
     CONCAT("$locked$", SHA2(u.id, 256))                        AS password_hash,
     COALESCE(NULLIF(LOWER(TRIM(u.role)), ""), "admin")         AS role,
     "active"                                                   AS status,
     COALESCE(u.created_at, NOW()),
     COALESCE(u.updated_at, NOW())
   FROM users u
   WHERE u.email IS NOT NULL
     AND TRIM(u.email) <> ""
     AND LOWER(TRIM(u.role)) NOT IN ("client", "member", "")
     AND LOWER(TRIM(u.email)) NOT IN (SELECT LOWER(TRIM(email)) FROM admin_users WHERE email IS NOT NULL)',
  'SELECT 1 -- users table does not exist, skip'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  @has_users > 0,
  'RENAME TABLE users TO _legacy_users',
  'SELECT 1 -- users table does not exist, skip'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. security_events → security_audit_events (merge)
--    security_events is a simpler log. Migrate rows into the richer table.
-- ─────────────────────────────────────────────────────────────────────────────
SET @has_security_events = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'security_events'
);

SET @sql = IF(
  @has_security_events > 0,
  'INSERT IGNORE INTO security_audit_events
     (actor_email, method, path, module, action, status_code, ip_address, severity, metadata, created_at)
   SELECT
     se.actor_email,
     "EVENT"                                       AS method,
     COALESCE(se.event_type, "unknown")            AS path,
     "security"                                    AS module,
     COALESCE(se.event_type, "event")              AS action,
     0                                             AS status_code,
     se.ip_address,
     COALESCE(NULLIF(se.severity, ""), "info")     AS severity,
     se.metadata,
     se.created_at
   FROM security_events se',
  'SELECT 1 -- security_events table does not exist, skip'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  @has_security_events > 0,
  'RENAME TABLE security_events TO _legacy_security_events',
  'SELECT 1 -- security_events table does not exist, skip'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS = 1;

-- End of migration 023
-- To remove the _legacy_* tables after verification, run:
--   023b_drop_legacy_shim_tables.sql
