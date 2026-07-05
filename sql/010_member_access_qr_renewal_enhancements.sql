-- Delivery 28: Member access, QR e-card expiry, renewal logic support
-- Adds a persisted last-access timestamp for member directory display and filtering.

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS last_access_at DATETIME NULL;

CREATE INDEX IF NOT EXISTS idx_members_last_access_at ON members (last_access_at);
