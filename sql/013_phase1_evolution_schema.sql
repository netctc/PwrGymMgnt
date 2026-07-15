-- =============================================================================
-- Phase 1: Evolution Schema — Multi-user plans, affiliations, session ledger
-- =============================================================================
-- Compatible: MariaDB 10.3+ / MySQL 5.7+
-- Idempotent: All CREATE TABLE IF NOT EXISTS.
-- Does NOT modify existing tables (member_subscriptions preserved for dual-read).
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- Plan Versions — immutable snapshot of commercial conditions
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS plan_versions (
  id                    VARCHAR(64)   PRIMARY KEY,
  plan_id               VARCHAR(64)   NOT NULL,
  version_number        INT           NOT NULL DEFAULT 1,
  name                  VARCHAR(180)  NOT NULL,
  description           TEXT          NULL,
  plan_type             VARCHAR(32)   NOT NULL DEFAULT 'individual',
  price                 DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency              VARCHAR(12)   NOT NULL DEFAULT 'USD',
  duration_days         INT           NOT NULL DEFAULT 30,
  auto_renew            TINYINT(1)    NOT NULL DEFAULT 0,
  max_members           INT           NOT NULL DEFAULT 1,
  sessions_unlimited    TINYINT(1)    NOT NULL DEFAULT 1,
  sessions_per_cycle    INT           NULL,
  cycle_frequency       VARCHAR(32)   NOT NULL DEFAULT 'monthly',
  distribution_model    VARCHAR(32)   NOT NULL DEFAULT 'individual',
  carryover_enabled     TINYINT(1)    NOT NULL DEFAULT 0,
  carryover_max         INT           NULL,
  carryover_expiry_days INT           NULL,
  extra_session_price   DECIMAL(12,2) NULL,
  consumption_priority  INT           NOT NULL DEFAULT 0,
  prorate_enabled       TINYINT(1)    NOT NULL DEFAULT 0,
  grace_period_days     INT           NOT NULL DEFAULT 0,
  benefits              JSON          NULL,
  restrictions          JSON          NULL,
  booking_policy        JSON          NULL,
  status                VARCHAR(32)   NOT NULL DEFAULT 'active',
  published_at          DATETIME      NULL,
  created_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data                  JSON          NULL,
  UNIQUE KEY uq_plan_versions_plan_number (plan_id, version_number),
  INDEX idx_plan_versions_plan   (plan_id),
  INDEX idx_plan_versions_status (status),
  INDEX idx_plan_versions_type   (plan_type),
  CONSTRAINT fk_plan_versions_plan
    FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- Subscriptions — concrete contract of a plan version
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subscriptions (
  id                      VARCHAR(64)   PRIMARY KEY,
  plan_id                 VARCHAR(64)   NOT NULL,
  plan_version_id         VARCHAR(64)   NOT NULL,
  holder_member_id        VARCHAR(255)  NOT NULL,
  status                  VARCHAR(32)   NOT NULL DEFAULT 'active',
  start_date              DATE          NOT NULL,
  end_date                DATE          NOT NULL,
  auto_renew              TINYINT(1)    NOT NULL DEFAULT 0,
  price_paid              DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency                VARCHAR(12)   NOT NULL DEFAULT 'USD',
  payment_status          VARCHAR(32)   NOT NULL DEFAULT 'pending',
  max_members             INT           NOT NULL DEFAULT 1,
  notes                   TEXT          NULL,
  version                 INT           NOT NULL DEFAULT 1,
  legacy_subscription_id  VARCHAR(64)   NULL,
  created_at              TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data                    JSON          NULL,
  INDEX idx_subscriptions_holder  (holder_member_id),
  INDEX idx_subscriptions_status  (status),
  INDEX idx_subscriptions_plan    (plan_version_id),
  INDEX idx_subscriptions_dates   (status, end_date),
  INDEX idx_subscriptions_legacy  (legacy_subscription_id),
  CONSTRAINT fk_subscriptions_plan_version
    FOREIGN KEY (plan_version_id) REFERENCES plan_versions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_subscriptions_holder
    FOREIGN KEY (holder_member_id) REFERENCES members(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- Subscription Members — administrative group membership
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subscription_members (
  id                VARCHAR(64)  PRIMARY KEY,
  subscription_id   VARCHAR(64)  NOT NULL,
  member_id         VARCHAR(255) NOT NULL,
  role              VARCHAR(32)  NOT NULL DEFAULT 'beneficiary',
  status            VARCHAR(32)  NOT NULL DEFAULT 'active',
  joined_at         DATETIME     NOT NULL,
  left_at           DATETIME     NULL,
  invited_by        VARCHAR(255) NULL,
  restrictions      JSON         NULL,
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sub_members_active (subscription_id, member_id, status),
  INDEX idx_sub_members_member       (member_id),
  INDEX idx_sub_members_subscription (subscription_id),
  CONSTRAINT fk_sub_members_subscription
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
  CONSTRAINT fk_sub_members_member
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- Affiliations — individual consumption rights
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS affiliations (
  id                      VARCHAR(64)  PRIMARY KEY,
  member_id               VARCHAR(255) NOT NULL,
  subscription_id         VARCHAR(64)  NOT NULL,
  subscription_member_id  VARCHAR(64)  NULL,
  plan_version_id         VARCHAR(64)  NOT NULL,
  status                  VARCHAR(32)  NOT NULL DEFAULT 'active',
  role                    VARCHAR(32)  NOT NULL DEFAULT 'beneficiary',
  is_primary              TINYINT(1)   NOT NULL DEFAULT 0,
  start_date              DATE         NOT NULL,
  end_date                DATE         NOT NULL,
  benefits_override       JSON         NULL,
  restrictions_override   JSON         NULL,
  consumption_priority    INT          NOT NULL DEFAULT 0,
  version                 INT          NOT NULL DEFAULT 1,
  created_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data                    JSON         NULL,
  INDEX idx_affiliations_member       (member_id),
  INDEX idx_affiliations_subscription (subscription_id),
  INDEX idx_affiliations_status       (status),
  INDEX idx_affiliations_member_status (member_id, status, end_date),
  CONSTRAINT fk_affiliations_subscription
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
  CONSTRAINT fk_affiliations_member
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  CONSTRAINT fk_affiliations_plan_version
    FOREIGN KEY (plan_version_id) REFERENCES plan_versions(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- Subscription Cycles — time periods for session allocation
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subscription_cycles (
  id                  VARCHAR(64)  PRIMARY KEY,
  subscription_id     VARCHAR(64)  NOT NULL,
  cycle_number        INT          NOT NULL DEFAULT 1,
  start_date          DATE         NOT NULL,
  end_date            DATE         NOT NULL,
  status              VARCHAR(32)  NOT NULL DEFAULT 'active',
  sessions_allocated  INT          NOT NULL DEFAULT 0,
  sessions_carried    INT          NOT NULL DEFAULT 0,
  closed_at           DATETIME     NULL,
  idempotency_key     VARCHAR(128) NULL,
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cycles_sub_number (subscription_id, cycle_number),
  UNIQUE KEY uq_cycles_idempotency (idempotency_key),
  INDEX idx_cycles_subscription (subscription_id),
  INDEX idx_cycles_status       (status),
  INDEX idx_cycles_dates        (start_date, end_date),
  CONSTRAINT fk_cycles_subscription
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- Session Balances — materialized projection (derived from movements)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS session_balances (
  id                    VARCHAR(64)  PRIMARY KEY,
  context_type          VARCHAR(32)  NOT NULL,
  context_id            VARCHAR(64)  NOT NULL,
  cycle_id              VARCHAR(64)  NOT NULL,
  included              INT          NOT NULL DEFAULT 0,
  carried_over          INT          NOT NULL DEFAULT 0,
  purchased             INT          NOT NULL DEFAULT 0,
  adjustments_positive  INT          NOT NULL DEFAULT 0,
  refunds               INT          NOT NULL DEFAULT 0,
  reserved              INT          NOT NULL DEFAULT 0,
  consumed              INT          NOT NULL DEFAULT 0,
  expired               INT          NOT NULL DEFAULT 0,
  adjustments_negative  INT          NOT NULL DEFAULT 0,
  available             INT          NOT NULL DEFAULT 0,
  last_movement_id      VARCHAR(64)  NULL,
  version               INT          NOT NULL DEFAULT 1,
  updated_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_balances_context_cycle (context_type, context_id, cycle_id),
  INDEX idx_balances_cycle     (cycle_id),
  INDEX idx_balances_context   (context_id),
  CONSTRAINT fk_balances_cycle
    FOREIGN KEY (cycle_id) REFERENCES subscription_cycles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- Session Movements — immutable ledger (append-only)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS session_movements (
  id                    VARCHAR(64)  PRIMARY KEY,
  balance_id            VARCHAR(64)  NOT NULL,
  affiliation_id        VARCHAR(64)  NULL,
  cycle_id              VARCHAR(64)  NOT NULL,
  movement_type         VARCHAR(32)  NOT NULL,
  quantity              INT          NOT NULL,
  direction             CHAR(1)      NOT NULL,
  balance_before        INT          NOT NULL,
  balance_after         INT          NOT NULL,
  reference_type        VARCHAR(64)  NULL,
  reference_id          VARCHAR(64)  NULL,
  related_movement_id   VARCHAR(64)  NULL,
  reason                VARCHAR(512) NULL,
  performed_by          VARCHAR(255) NULL,
  idempotency_key       VARCHAR(128) NULL,
  created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data                  JSON         NULL,
  UNIQUE KEY uq_movements_idempotency (idempotency_key),
  INDEX idx_movements_balance     (balance_id),
  INDEX idx_movements_affiliation (affiliation_id),
  INDEX idx_movements_cycle       (cycle_id),
  INDEX idx_movements_reference   (reference_type, reference_id),
  INDEX idx_movements_created     (created_at),
  INDEX idx_movements_type        (movement_type),
  CONSTRAINT fk_movements_balance
    FOREIGN KEY (balance_id) REFERENCES session_balances(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- Idempotency Keys — prevent duplicate operations
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id              VARCHAR(128) PRIMARY KEY,
  operation       VARCHAR(64)  NOT NULL,
  result_status   INT          NOT NULL DEFAULT 200,
  result_body     JSON         NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at      DATETIME     NOT NULL,
  INDEX idx_idempotency_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- Outbox Events — transactional outbox for side effects
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS outbox_events (
  id              VARCHAR(64)  PRIMARY KEY,
  event_type      VARCHAR(64)  NOT NULL,
  payload         JSON         NOT NULL,
  status          VARCHAR(32)  NOT NULL DEFAULT 'pending',
  attempts        INT          NOT NULL DEFAULT 0,
  last_attempt_at DATETIME     NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at    DATETIME     NULL,
  INDEX idx_outbox_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- Feature Flags — gradual activation
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS feature_flags (
  id          VARCHAR(64)  PRIMARY KEY,
  flag_key    VARCHAR(120) NOT NULL,
  enabled     TINYINT(1)   NOT NULL DEFAULT 0,
  scope       VARCHAR(32)  NOT NULL DEFAULT 'global',
  scope_value VARCHAR(255) NULL,
  description VARCHAR(512) NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_feature_flags_key_scope (flag_key, scope, scope_value)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed initial feature flags (disabled by default)
INSERT IGNORE INTO feature_flags (id, flag_key, enabled, scope, description) VALUES
  ('ff_new_sub_model', 'ENABLE_NEW_SUBSCRIPTION_MODEL', 0, 'global', 'Enable new subscription/affiliation model'),
  ('ff_session_ledger', 'ENABLE_SESSION_LEDGER', 0, 'global', 'Enable session movement ledger for limited plans'),
  ('ff_multi_affiliation', 'ENABLE_MULTI_AFFILIATION', 0, 'global', 'Enable multiple affiliations per member'),
  ('ff_multi_user_plans', 'ENABLE_MULTI_USER_PLANS', 0, 'global', 'Enable family/group/corporate plans'),
  ('ff_unified_access', 'ENABLE_UNIFIED_ACCESS', 0, 'global', 'Enable unified access authorization motor'),
  ('ff_facial_access', 'ENABLE_FACIAL_ACCESS', 0, 'global', 'Enable facial recognition access');

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration Mappings — track old→new entity relationships
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS migration_mappings (
  id             VARCHAR(64)  PRIMARY KEY,
  source_table   VARCHAR(120) NOT NULL,
  source_id      VARCHAR(255) NOT NULL,
  target_table   VARCHAR(120) NOT NULL,
  target_id      VARCHAR(255) NOT NULL,
  migration_batch VARCHAR(64) NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_migration_source (source_table, source_id, target_table),
  INDEX idx_migration_target (target_table, target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
