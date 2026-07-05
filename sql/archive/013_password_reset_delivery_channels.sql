-- PowerGym Management - Phase 6 password reset delivery channels
-- Purpose: support real password reset delivery through configured email/SMS providers.
-- This migration is idempotent because the project migration runner replays SQL files.

SET NAMES utf8mb4;
SET @schema_name = DATABASE();

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE admin_users ADD COLUMN reset_phone VARCHAR(32) NULL', 'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'admin_users' AND COLUMN_NAME = 'reset_phone');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE admin_users ADD COLUMN reset_delivery_channel VARCHAR(32) NULL', 'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'admin_users' AND COLUMN_NAME = 'reset_delivery_channel');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE password_reset_tokens ADD COLUMN delivery_request_id VARCHAR(64) NULL', 'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'password_reset_tokens' AND COLUMN_NAME = 'delivery_request_id');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE password_reset_tokens ADD COLUMN delivery_channel VARCHAR(32) NULL', 'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'password_reset_tokens' AND COLUMN_NAME = 'delivery_channel');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE password_reset_tokens ADD COLUMN delivery_status VARCHAR(32) NULL', 'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'password_reset_tokens' AND COLUMN_NAME = 'delivery_status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE password_reset_tokens ADD COLUMN delivery_provider VARCHAR(64) NULL', 'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'password_reset_tokens' AND COLUMN_NAME = 'delivery_provider');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE password_reset_tokens ADD COLUMN delivery_last_error VARCHAR(512) NULL', 'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'password_reset_tokens' AND COLUMN_NAME = 'delivery_last_error');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE password_reset_tokens ADD COLUMN delivered_at DATETIME NULL', 'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'password_reset_tokens' AND COLUMN_NAME = 'delivered_at');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE password_reset_tokens ADD INDEX idx_password_reset_delivery_status (delivery_status)', 'SELECT 1') FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'password_reset_tokens' AND INDEX_NAME = 'idx_password_reset_delivery_status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE password_reset_tokens ADD INDEX idx_password_reset_delivery_request (delivery_request_id)', 'SELECT 1') FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'password_reset_tokens' AND INDEX_NAME = 'idx_password_reset_delivery_request');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
