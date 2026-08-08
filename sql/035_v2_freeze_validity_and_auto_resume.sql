-- Preserve the immutable contract end date used to recalculate validity.
SET NAMES utf8mb4;

-- This migration may be retried after an interrupted first run. The conditional
-- column-add form is not supported on every deployment, so use
-- information_schema to make the schema change resumable.
SET @has_original_end_date := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'subscription_freezes'
     AND COLUMN_NAME = 'original_end_date'
);
SET @add_original_end_date := IF(
  @has_original_end_date = 0,
  'ALTER TABLE subscription_freezes ADD COLUMN original_end_date DATE NULL AFTER planned_end_date',
  'SELECT 1'
);
PREPARE add_original_end_date_stmt FROM @add_original_end_date;
EXECUTE add_original_end_date_stmt;
DEALLOCATE PREPARE add_original_end_date_stmt;

UPDATE subscription_freezes f
JOIN subscriptions s ON s.id = f.subscription_id
SET f.original_end_date = DATE_SUB(
  s.end_date,
  INTERVAL IF(f.extends_end_date = 1, DATEDIFF(f.planned_end_date, f.start_date) + 1, 0) DAY
)
WHERE f.original_end_date IS NULL;

ALTER TABLE subscription_freezes
  MODIFY original_end_date DATE NOT NULL;
