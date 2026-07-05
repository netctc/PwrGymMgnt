-- PowerGym Management - Phase 7 security observability indexes
-- Purpose: speed up Security Center filters, alert calculations, and reset delivery reviews.

SET NAMES utf8mb4;
SET @schema_name = DATABASE();

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE security_audit_events ADD INDEX idx_security_audit_range_status (created_at, status_code)', 'SELECT 1') FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'security_audit_events' AND INDEX_NAME = 'idx_security_audit_range_status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE security_audit_events ADD INDEX idx_security_audit_range_module_severity (created_at, module, severity)', 'SELECT 1') FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'security_audit_events' AND INDEX_NAME = 'idx_security_audit_range_module_severity');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE password_reset_tokens ADD INDEX idx_password_reset_created_delivery (created_at, delivery_status, delivery_channel)', 'SELECT 1') FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'password_reset_tokens' AND INDEX_NAME = 'idx_password_reset_created_delivery');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
