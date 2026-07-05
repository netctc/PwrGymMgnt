-- Migration 023b: DROP Legacy Shim Tables
-- Permanently removes the _legacy_* tables created by migration 023.
--
-- !! RUN ONLY AFTER:
--   1. Migration 023 applied successfully.
--   2. Verified no application reads target the _legacy_* tables.
--   3. Full database backup taken.
--
-- Compatible with MySQL 5.7+ and MariaDB 10.3+.
-- Uses PREPARE/EXECUTE guards instead of CREATE PROCEDURE (no DELIMITER needed).

SET NAMES utf8mb4;
SET @schema_name = DATABASE();

-- _legacy_appSettings
SET @s = (SELECT IF(COUNT(*) > 0, 'DROP TABLE `_legacy_appSettings`', 'SELECT 1')
          FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = '_legacy_appSettings');
PREPARE _s FROM @s; EXECUTE _s; DEALLOCATE PREPARE _s;

-- _legacy_plans
SET @s = (SELECT IF(COUNT(*) > 0, 'DROP TABLE `_legacy_plans`', 'SELECT 1')
          FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = '_legacy_plans');
PREPARE _s FROM @s; EXECUTE _s; DEALLOCATE PREPARE _s;

-- _legacy_subscriptions
SET @s = (SELECT IF(COUNT(*) > 0, 'DROP TABLE `_legacy_subscriptions`', 'SELECT 1')
          FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = '_legacy_subscriptions');
PREPARE _s FROM @s; EXECUTE _s; DEALLOCATE PREPARE _s;

-- _legacy_classes
SET @s = (SELECT IF(COUNT(*) > 0, 'DROP TABLE `_legacy_classes`', 'SELECT 1')
          FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = '_legacy_classes');
PREPARE _s FROM @s; EXECUTE _s; DEALLOCATE PREPARE _s;

-- _legacy_hr
SET @s = (SELECT IF(COUNT(*) > 0, 'DROP TABLE `_legacy_hr`', 'SELECT 1')
          FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = '_legacy_hr');
PREPARE _s FROM @s; EXECUTE _s; DEALLOCATE PREPARE _s;

-- _legacy_accounting
SET @s = (SELECT IF(COUNT(*) > 0, 'DROP TABLE `_legacy_accounting`', 'SELECT 1')
          FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = '_legacy_accounting');
PREPARE _s FROM @s; EXECUTE _s; DEALLOCATE PREPARE _s;

-- _legacy_staff
SET @s = (SELECT IF(COUNT(*) > 0, 'DROP TABLE `_legacy_staff`', 'SELECT 1')
          FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = '_legacy_staff');
PREPARE _s FROM @s; EXECUTE _s; DEALLOCATE PREPARE _s;

-- _legacy_users
SET @s = (SELECT IF(COUNT(*) > 0, 'DROP TABLE `_legacy_users`', 'SELECT 1')
          FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = '_legacy_users');
PREPARE _s FROM @s; EXECUTE _s; DEALLOCATE PREPARE _s;

-- _legacy_security_events
SET @s = (SELECT IF(COUNT(*) > 0, 'DROP TABLE `_legacy_security_events`', 'SELECT 1')
          FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = '_legacy_security_events');
PREPARE _s FROM @s; EXECUTE _s; DEALLOCATE PREPARE _s;
