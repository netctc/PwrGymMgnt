-- PowerGym Management - Delivery 29
-- QR e-card PDF delivery logs and template configuration support.

CREATE TABLE IF NOT EXISTS ecard_delivery_logs (
  id VARCHAR(64) PRIMARY KEY,
  member_id VARCHAR(255) NOT NULL,
  token_id VARCHAR(64) NULL,
  channel VARCHAR(32) NOT NULL,
  recipient VARCHAR(255) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  error_message TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  data JSON NULL,
  INDEX idx_ecard_delivery_member (member_id),
  INDEX idx_ecard_delivery_channel (channel),
  INDEX idx_ecard_delivery_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settings (
  id VARCHAR(255) PRIMARY KEY,
  data JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO settings (id, data)
VALUES (
  'general',
  JSON_OBJECT(
    'ecardTitle', 'PowerGym QR e-Card',
    'ecardNote', 'Present this QR e-card at reception for access validation.',
    'ecardBackgroundImage', ''
  )
)
ON DUPLICATE KEY UPDATE
  data = data;
