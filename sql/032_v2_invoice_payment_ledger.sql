-- Immutable V2 invoice payment events. Invoice state is derived from this ledger.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS invoice_payment_events_v2 (
  id              VARCHAR(64) PRIMARY KEY,
  invoice_id      VARCHAR(64) NOT NULL,
  event_type      VARCHAR(24) NOT NULL,
  amount          DECIMAL(10,2) NOT NULL,
  currency        VARCHAR(12) NOT NULL,
  effective_date  DATE NOT NULL,
  reason          VARCHAR(500) NULL,
  performed_by    VARCHAR(255) NULL,
  idempotency_key VARCHAR(190) NOT NULL,
  data            JSON NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_invoice_payment_event_idempotency (idempotency_key),
  INDEX idx_invoice_payment_event_invoice (invoice_id, created_at),
  CONSTRAINT fk_invoice_payment_event_invoice
    FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE RESTRICT,
  CONSTRAINT chk_invoice_payment_event_amount CHECK (amount > 0),
  CONSTRAINT chk_invoice_payment_event_type
    CHECK (event_type IN ('payment', 'waive', 'refund'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
