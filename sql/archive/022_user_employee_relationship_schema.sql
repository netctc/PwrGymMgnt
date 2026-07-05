-- Delivery 63: User-Employee 1:1 Relationship & Employee User Creation
-- Adds employee_id to admin_users and creates a unique index.
-- The FK to employees is intentionally omitted: employees.id has no explicit
-- charset/collation declaration so the constraint is unreliable across
-- MariaDB/MySQL server configurations. Referential integrity is enforced
-- at the application layer (server/userManagement.ts).
-- Compatible with MySQL 5.7+ and MariaDB 10.3+.

SET NAMES utf8mb4;
SET @schema_name = DATABASE();

-- Add employee_id column if it does not already exist
SET @s1 = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE admin_users ADD COLUMN employee_id VARCHAR(64) NULL',
    'SELECT 1'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME   = 'admin_users'
    AND COLUMN_NAME  = 'employee_id'
);
PREPARE _s FROM @s1; EXECUTE _s; DEALLOCATE PREPARE _s;

-- Add unique index on employee_id if it does not already exist
SET @s2 = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE admin_users ADD UNIQUE KEY uq_admin_users_employee_id (employee_id)',
    'SELECT 1'
  )
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME   = 'admin_users'
    AND INDEX_NAME   = 'uq_admin_users_employee_id'
);
PREPARE _s FROM @s2; EXECUTE _s; DEALLOCATE PREPARE _s;
