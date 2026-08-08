-- Auditable V2 subscription freeze/resume periods.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS subscription_freezes (
  id                VARCHAR(64) PRIMARY KEY,
  subscription_id   VARCHAR(64) NOT NULL,
  start_date        DATE NOT NULL,
  planned_end_date  DATE NOT NULL,
  actual_end_date   DATE NULL,
  frozen_days       INT NULL,
  reason            VARCHAR(500) NOT NULL,
  extends_end_date  TINYINT(1) NOT NULL DEFAULT 1,
  status            VARCHAR(32) NOT NULL DEFAULT 'active',
  created_by        VARCHAR(255) NULL,
  resumed_at        DATETIME NULL,
  resumed_by        VARCHAR(255) NULL,
  resumed_reason    VARCHAR(500) NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_subscription_freezes_subscription (subscription_id, status, created_at),
  CONSTRAINT fk_subscription_freezes_subscription
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
  CONSTRAINT chk_subscription_freeze_dates CHECK (start_date <= planned_end_date),
  CONSTRAINT chk_subscription_freeze_days CHECK (frozen_days IS NULL OR frozen_days > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
