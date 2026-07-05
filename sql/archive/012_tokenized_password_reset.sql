-- Phase 5: tokenized password reset workflow.
-- Stores only HMAC hashes of reset tokens. Raw tokens must be delivered by email/SMS and are never persisted.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id VARCHAR(64) PRIMARY KEY,
  user_id INT NOT NULL,
  email VARCHAR(255) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  revoked_at DATETIME NULL,
  requested_ip VARCHAR(64) NULL,
  requested_user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_password_reset_email (email),
  INDEX idx_password_reset_user (user_id),
  INDEX idx_password_reset_token_hash (token_hash),
  INDEX idx_password_reset_expires (expires_at),
  INDEX idx_password_reset_status (used_at, revoked_at),
  CONSTRAINT fk_password_reset_admin_user FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
