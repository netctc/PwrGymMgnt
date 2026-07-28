SET NAMES utf8mb4;

SET @schema_name = DATABASE();

SET @add_commission_period_start = (
  SELECT IF(
    NOT EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = @schema_name
         AND TABLE_NAME = 'trainer_plan_commissions'
         AND COLUMN_NAME = 'period_start'
    ),
    'ALTER TABLE trainer_plan_commissions ADD COLUMN period_start DATE NULL AFTER due_date',
    'SELECT 1'
  )
);
PREPARE stmt FROM @add_commission_period_start;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_commission_period_end = (
  SELECT IF(
    NOT EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = @schema_name
         AND TABLE_NAME = 'trainer_plan_commissions'
         AND COLUMN_NAME = 'period_end'
    ),
    'ALTER TABLE trainer_plan_commissions ADD COLUMN period_end DATE NULL AFTER period_start',
    'SELECT 1'
  )
);
PREPARE stmt FROM @add_commission_period_end;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_commission_sessions_contracted = (
  SELECT IF(
    NOT EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = @schema_name
         AND TABLE_NAME = 'trainer_plan_commissions'
         AND COLUMN_NAME = 'sessions_contracted'
    ),
    'ALTER TABLE trainer_plan_commissions ADD COLUMN sessions_contracted INT NOT NULL DEFAULT 0 AFTER period_end',
    'SELECT 1'
  )
);
PREPARE stmt FROM @add_commission_sessions_contracted;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_commission_sessions_paid = (
  SELECT IF(
    NOT EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = @schema_name
         AND TABLE_NAME = 'trainer_plan_commissions'
         AND COLUMN_NAME = 'sessions_paid'
    ),
    'ALTER TABLE trainer_plan_commissions ADD COLUMN sessions_paid INT NOT NULL DEFAULT 0 AFTER sessions_contracted',
    'SELECT 1'
  )
);
PREPARE stmt FROM @add_commission_sessions_paid;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_commission_amount_paid = (
  SELECT IF(
    NOT EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = @schema_name
         AND TABLE_NAME = 'trainer_plan_commissions'
         AND COLUMN_NAME = 'amount_paid'
    ),
    'ALTER TABLE trainer_plan_commissions ADD COLUMN amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER sessions_paid',
    'SELECT 1'
  )
);
PREPARE stmt FROM @add_commission_amount_paid;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_commission_amount_pending = (
  SELECT IF(
    NOT EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = @schema_name
         AND TABLE_NAME = 'trainer_plan_commissions'
         AND COLUMN_NAME = 'amount_pending'
    ),
    'ALTER TABLE trainer_plan_commissions ADD COLUMN amount_pending DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER amount_paid',
    'SELECT 1'
  )
);
PREPARE stmt FROM @add_commission_amount_pending;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE trainer_plan_commissions tpc
LEFT JOIN invoices invoice ON invoice.id = tpc.invoice_id
LEFT JOIN subscriptions subscription ON subscription.id = tpc.subscription_id
   SET tpc.period_start = COALESCE(
         STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(invoice.data, '$.periodStart')), '%Y-%m-%d'),
         subscription.start_date
       ),
       tpc.period_end = COALESCE(
         STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(invoice.data, '$.periodEnd')), '%Y-%m-%d'),
         subscription.end_date
       ),
       tpc.due_date = COALESCE(
         STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(invoice.data, '$.periodEnd')), '%Y-%m-%d'),
         subscription.end_date
       ),
       tpc.amount_paid = CASE
         WHEN tpc.payment_status = 'paid' THEN tpc.trainer_amount
         ELSE tpc.amount_paid
       END,
       tpc.amount_pending = CASE
         WHEN tpc.payment_status = 'paid' THEN 0
         ELSE GREATEST(tpc.trainer_amount - tpc.amount_paid, 0)
       END;

UPDATE trainer_plan_commissions tpc
JOIN plan_versions plan ON plan.id = tpc.plan_version_id
   SET tpc.sessions_contracted = CASE
         WHEN plan.sessions_unlimited = 1 THEN 0
         ELSE GREATEST(0, COALESCE(plan.sessions_per_cycle, 0)) *
           GREATEST(
             1,
             CEIL(
               (DATEDIFF(tpc.period_end, tpc.period_start) + 1) /
               CASE plan.cycle_frequency
                 WHEN 'weekly' THEN 7
                 WHEN 'quarterly' THEN 90
                 WHEN 'subscription' THEN GREATEST(DATEDIFF(tpc.period_end, tpc.period_start) + 1, 1)
                 ELSE 30
               END
             )
           )
       END
 WHERE tpc.sessions_contracted = 0;

CREATE TABLE IF NOT EXISTS trainer_commission_payments (
  id                          VARCHAR(64)   PRIMARY KEY,
  commission_id               VARCHAR(64)   NOT NULL,
  payment_type                VARCHAR(24)   NOT NULL,
  amount                      DECIMAL(12,2) NOT NULL,
  commission_total            DECIMAL(12,2) NOT NULL,
  balance_before              DECIMAL(12,2) NOT NULL,
  balance_after               DECIMAL(12,2) NOT NULL,
  sessions_contracted         INT           NOT NULL DEFAULT 0,
  sessions_consumed_snapshot  INT           NOT NULL DEFAULT 0,
  sessions_paid_before        INT           NOT NULL DEFAULT 0,
  sessions_paid_after         INT           NOT NULL DEFAULT 0,
  authorized_by               VARCHAR(255)  NOT NULL,
  paid_at                     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finance_transaction_id      VARCHAR(64)   NULL,
  idempotency_key             VARCHAR(128)  NOT NULL,
  data                        JSON          NULL,
  UNIQUE KEY uq_trainer_commission_payment_idempotency (idempotency_key),
  INDEX idx_trainer_commission_payments_commission (commission_id, paid_at),
  INDEX idx_trainer_commission_payments_authorizer (authorized_by, paid_at),
  CONSTRAINT fk_trainer_commission_payments_commission
    FOREIGN KEY (commission_id) REFERENCES trainer_plan_commissions(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
