-- Delivery 28: Member access, QR e-card expiry, renewal logic support
-- Adds a persisted last-access timestamp for member directory display and filtering.
-- MySQL does not accept ADD COLUMN / CREATE INDEX with IF NOT EXISTS, so
-- INFORMATION_SCHEMA guards keep this migration portable and idempotent.

SET NAMES utf8mb4;
SET @schema_name = DATABASE();

SET @sql = (SELECT IF(
  EXISTS(
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'members'
  )
  AND NOT EXISTS(
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name
      AND TABLE_NAME = 'members'
      AND COLUMN_NAME = 'last_access_at'
  ),
  'ALTER TABLE members ADD COLUMN last_access_at DATETIME NULL',
  'SELECT 1'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
  EXISTS(
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name
      AND TABLE_NAME = 'members'
      AND COLUMN_NAME = 'last_access_at'
  )
  AND NOT EXISTS(
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = @schema_name
      AND TABLE_NAME = 'members'
      AND INDEX_NAME = 'idx_members_last_access_at'
  ),
  'CREATE INDEX idx_members_last_access_at ON members (last_access_at)',
  'SELECT 1'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
