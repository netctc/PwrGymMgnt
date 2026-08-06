-- Give V2 invoices a real foreign key without overloading the legacy subscription link.
ALTER TABLE invoices
  ADD COLUMN subscription_v2_id VARCHAR(64) NULL AFTER subscription_id,
  ADD INDEX idx_invoices_subscription_v2 (subscription_v2_id),
  ADD CONSTRAINT fk_invoices_subscription_v2
    FOREIGN KEY (subscription_v2_id) REFERENCES subscriptions (id)
    ON DELETE SET NULL;
