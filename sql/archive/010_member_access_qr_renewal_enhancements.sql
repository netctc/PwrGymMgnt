-- Delivery 28: Member access, QR e-card expiry, renewal logic support
-- Adds a persisted last-access timestamp for member directory display and filtering.
-- Compatible with MariaDB 10.3+ and MySQL 5.7+.

SET NAMES utf8mb4;
SET @schema_name = DATABASE();

-- Add column if missing
SET @s1 = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE members ADD COLUMN last_access_at DATETIME NULL',
    'SELECT 1'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME   = 'members'
    AND COLUMN_NAME  = 'last_access_at'
);
PREPARE _s FROM @s1; EXECUTE _s; DEALLOCATE PREPARE _s;

-- Add index if missing
SET @s2 = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE members ADD INDEX idx_members_last_access_at (last_access_at)',
    'SELECT 1'
  )
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME   = 'members'
    AND INDEX_NAME   = 'idx_members_last_access_at'
);
PREPARE _s FROM @s2; EXECUTE _s; DEALLOCATE PREPARE _s;
