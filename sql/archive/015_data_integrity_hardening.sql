-- PowerGym Management - Delivery 35 / Phase 10 data integrity hardening
-- Adds non-destructive support tables and indexes for integrity diagnostics.
-- This migration intentionally avoids new foreign keys/check constraints that could fail on existing dirty data.

SET @schema_name = DATABASE();

CREATE TABLE IF NOT EXISTS data_integrity_runs (
  id VARCHAR(64) PRIMARY KEY,
  posture VARCHAR(32) NOT NULL,
  total_checks INT NOT NULL DEFAULT 0,
  failing_checks INT NOT NULL DEFAULT 0,
  critical_checks INT NOT NULL DEFAULT 0,
  warning_checks INT NOT NULL DEFAULT 0,
  affected_rows INT NOT NULL DEFAULT 0,
  generated_by VARCHAR(255) NULL,
  summary JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_data_integrity_runs_created (created_at),
  INDEX idx_data_integrity_runs_posture (posture)
);

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE member_subscriptions ADD INDEX idx_member_subscriptions_access_lookup (member_id, status, end_date)', 'SELECT 1') FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'member_subscriptions' AND INDEX_NAME = 'idx_member_subscriptions_access_lookup');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE subscriptions ADD INDEX idx_subscriptions_access_lookup (member_id, status, end_date)', 'SELECT 1') FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'subscriptions' AND INDEX_NAME = 'idx_subscriptions_access_lookup');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE invoices ADD INDEX idx_invoices_member_status_due (member_id, status, due_date)', 'SELECT 1') FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'invoices' AND INDEX_NAME = 'idx_invoices_member_status_due');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE access_tokens ADD INDEX idx_access_tokens_status_expiry (status, expires_at, revoked_at)', 'SELECT 1') FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'access_tokens' AND INDEX_NAME = 'idx_access_tokens_status_expiry');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE class_bookings ADD INDEX idx_class_bookings_member_status (member_id, status)', 'SELECT 1') FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'class_bookings' AND INDEX_NAME = 'idx_class_bookings_member_status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE private_sessions ADD INDEX idx_private_sessions_member_status_time (member_id, status, start_time)', 'SELECT 1') FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'private_sessions' AND INDEX_NAME = 'idx_private_sessions_member_status_time');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE payroll_items ADD INDEX idx_payroll_items_employee_status (employee_id, status)', 'SELECT 1') FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'payroll_items' AND INDEX_NAME = 'idx_payroll_items_employee_status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE finance_transactions ADD INDEX idx_finance_tx_type_status_date (type, status, transaction_date)', 'SELECT 1') FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'finance_transactions' AND INDEX_NAME = 'idx_finance_tx_type_status_date');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
