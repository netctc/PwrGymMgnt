SET NAMES utf8mb4;

SET @schema_name = DATABASE();

SET @add_plan_trainer = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'plan_versions'
    ) AND NOT EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'plan_versions'
         AND COLUMN_NAME = 'trainer_id'
    ),
    'ALTER TABLE plan_versions ADD COLUMN trainer_id VARCHAR(64) NULL AFTER description',
    'SELECT 1'
  )
);
PREPARE stmt FROM @add_plan_trainer;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_plan_trainer_name = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'plan_versions'
    ) AND NOT EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'plan_versions'
         AND COLUMN_NAME = 'trainer_name'
    ),
    'ALTER TABLE plan_versions ADD COLUMN trainer_name VARCHAR(180) NULL AFTER trainer_id',
    'SELECT 1'
  )
);
PREPARE stmt FROM @add_plan_trainer_name;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_plan_commission = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'plan_versions'
    ) AND NOT EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'plan_versions'
         AND COLUMN_NAME = 'trainer_commission_percent'
    ),
    'ALTER TABLE plan_versions ADD COLUMN trainer_commission_percent DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER trainer_name',
    'SELECT 1'
  )
);
PREPARE stmt FROM @add_plan_commission;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS trainer_plan_commissions (
  id                    VARCHAR(64)   PRIMARY KEY,
  trainer_id            VARCHAR(64)   NOT NULL,
  trainer_name          VARCHAR(180)  NOT NULL,
  subscription_id       VARCHAR(64)   NOT NULL,
  plan_id               VARCHAR(64)   NOT NULL,
  plan_version_id       VARCHAR(64)   NOT NULL,
  plan_name             VARCHAR(180)  NOT NULL,
  plan_type             VARCHAR(32)   NOT NULL,
  invoice_id            VARCHAR(64)   NOT NULL,
  invoice_number        VARCHAR(80)   NOT NULL,
  cycle_reference       VARCHAR(120)  NOT NULL,
  gross_amount          DECIMAL(12,2) NOT NULL DEFAULT 0,
  commission_percent    DECIMAL(5,2)  NOT NULL DEFAULT 0,
  trainer_amount        DECIMAL(12,2) NOT NULL DEFAULT 0,
  gym_amount            DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency              VARCHAR(12)   NOT NULL DEFAULT 'USD',
  payment_status        VARCHAR(32)   NOT NULL DEFAULT 'pending',
  due_date              DATE          NULL,
  earned_at             DATETIME      NULL,
  paid_at               DATETIME      NULL,
  created_by            VARCHAR(255)  NULL,
  created_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data                  JSON          NULL,
  UNIQUE KEY uq_trainer_commission_cycle (cycle_reference),
  INDEX idx_trainer_commissions_trainer_date (trainer_id, created_at),
  INDEX idx_trainer_commissions_plan_status (plan_type, payment_status),
  INDEX idx_trainer_commissions_invoice (invoice_id),
  CONSTRAINT fk_trainer_commissions_subscription
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_trainer_commissions_plan_version
    FOREIGN KEY (plan_version_id) REFERENCES plan_versions(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS trainer_plan_assignment_history (
  id                          VARCHAR(64)   PRIMARY KEY,
  plan_id                     VARCHAR(64)   NOT NULL,
  plan_version_id             VARCHAR(64)   NOT NULL,
  previous_trainer_id         VARCHAR(64)   NULL,
  previous_trainer_name       VARCHAR(180)  NULL,
  previous_commission_percent DECIMAL(5,2)  NULL,
  trainer_id                  VARCHAR(64)   NULL,
  trainer_name                VARCHAR(180)  NULL,
  commission_percent          DECIMAL(5,2)  NOT NULL DEFAULT 0,
  changed_by                  VARCHAR(255)  NULL,
  changed_at                  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  details                     JSON          NULL,
  INDEX idx_trainer_assignment_plan (plan_id, changed_at),
  INDEX idx_trainer_assignment_trainer (trainer_id, changed_at),
  CONSTRAINT fk_trainer_assignment_plan_version
    FOREIGN KEY (plan_version_id) REFERENCES plan_versions(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
