-- Give V2 invoices a real foreign key without overloading the legacy link.
-- Idempotent across supported MySQL and MariaDB versions.

SET @add_subscription_v2_column = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'invoices'
        AND COLUMN_NAME = 'subscription_v2_id'
    ),
    'SELECT 1',
    'ALTER TABLE invoices ADD COLUMN subscription_v2_id VARCHAR(64) NULL AFTER subscription_id'
  )
);

PREPARE statement FROM @add_subscription_v2_column;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @add_subscription_v2_index = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'invoices'
        AND INDEX_NAME = 'idx_invoices_subscription_v2'
    ),
    'SELECT 1',
    'CREATE INDEX idx_invoices_subscription_v2 ON invoices (subscription_v2_id)'
  )
);

PREPARE statement FROM @add_subscription_v2_index;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @add_subscription_v2_fk = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND TABLE_NAME = 'invoices'
        AND CONSTRAINT_NAME = 'fk_invoices_subscription_v2'
    ),
    'SELECT 1',
    'ALTER TABLE invoices ADD CONSTRAINT fk_invoices_subscription_v2 FOREIGN KEY (subscription_v2_id) REFERENCES subscriptions (id) ON DELETE SET NULL'
  )
);

PREPARE statement FROM @add_subscription_v2_fk;
EXECUTE statement;
DEALLOCATE PREPARE statement;