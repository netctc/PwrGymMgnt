-- Canonical V2 foundations: immutable audit, idempotency and contractual periods.
-- Additive and safe to run repeatedly.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS subscription_periods_v2 (
  id                    VARCHAR(64) PRIMARY KEY,
  subscription_id       VARCHAR(64) NOT NULL,
  period_number         INT NOT NULL,
  start_date            DATE NOT NULL,
  end_date              DATE NOT NULL,
  expected_payment_date DATE NOT NULL,
  status                VARCHAR(32) NOT NULL DEFAULT 'pending_activation',
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_subscription_period_number (subscription_id, period_number),
  INDEX idx_subscription_period_dates (subscription_id, start_date, end_date),
  INDEX idx_subscription_period_payment_date (expected_payment_date, status),
  CONSTRAINT chk_subscription_period_dates CHECK (start_date <= end_date),
  CONSTRAINT chk_subscription_period_payment CHECK (expected_payment_date BETWEEN start_date AND end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS domain_idempotency_keys (
  scope_key       VARCHAR(100) NOT NULL,
  idempotency_key VARCHAR(190) NOT NULL,
  request_hash    CHAR(64) NOT NULL,
  status          VARCHAR(32) NOT NULL,
  response_status INT NULL,
  response_body   JSON NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at      DATETIME NULL,
  PRIMARY KEY (scope_key, idempotency_key),
  INDEX idx_domain_idempotency_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS domain_audit_events (
  id             VARCHAR(64) PRIMARY KEY,
  entity_type    VARCHAR(64) NOT NULL,
  entity_id      VARCHAR(64) NOT NULL,
  event_type     VARCHAR(100) NOT NULL,
  actor_id       VARCHAR(255) NULL,
  correlation_id VARCHAR(100) NOT NULL,
  before_state   JSON NULL,
  after_state    JSON NULL,
  reason         VARCHAR(500) NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_domain_audit_entity (entity_type, entity_id, created_at),
  INDEX idx_domain_audit_correlation (correlation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
