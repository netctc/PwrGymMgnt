-- Auditable and schedulable V2 subscription cancellations.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS subscription_cancellations (
  id                  VARCHAR(64) PRIMARY KEY,
  subscription_id     VARCHAR(64) NOT NULL,
  effective_date      DATE NOT NULL,
  reason              VARCHAR(500) NOT NULL,
  status              VARCHAR(32) NOT NULL DEFAULT 'scheduled',
  refund_review       JSON NULL,
  affected_members    INT NOT NULL DEFAULT 0,
  cancelled_bookings  INT NOT NULL DEFAULT 0,
  cancelled_sessions  INT NOT NULL DEFAULT 0,
  created_by          VARCHAR(255) NULL,
  completed_at        DATETIME NULL,
  completed_by        VARCHAR(255) NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_subscription_cancellations_due (status, effective_date),
  INDEX idx_subscription_cancellations_subscription (subscription_id, created_at),
  CONSTRAINT fk_subscription_cancellations_subscription
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
  CONSTRAINT chk_subscription_cancellation_status
    CHECK (status IN ('scheduled', 'completed', 'voided'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
