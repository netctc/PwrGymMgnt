-- Delivery 7: security, audit, performance, and reporting hardening.

CREATE TABLE IF NOT EXISTS security_audit_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  request_id VARCHAR(80) NULL,
  actor_id VARCHAR(255) NULL,
  actor_email VARCHAR(255) NULL,
  actor_role VARCHAR(80) NULL,
  method VARCHAR(16) NOT NULL,
  path VARCHAR(512) NOT NULL,
  module VARCHAR(80) NOT NULL DEFAULT 'core',
  action VARCHAR(80) NOT NULL DEFAULT 'request',
  status_code INT NOT NULL DEFAULT 0,
  duration_ms INT NOT NULL DEFAULT 0,
  ip_address VARCHAR(128) NULL,
  user_agent TEXT NULL,
  severity VARCHAR(32) NOT NULL DEFAULT 'info',
  metadata JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_security_audit_created (created_at),
  INDEX idx_security_audit_actor (actor_email),
  INDEX idx_security_audit_module (module),
  INDEX idx_security_audit_status (status_code),
  INDEX idx_security_audit_request (request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS security_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  severity VARCHAR(32) NOT NULL DEFAULT 'info',
  actor_email VARCHAR(255) NULL,
  ip_address VARCHAR(128) NULL,
  details TEXT NULL,
  metadata JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_security_events_created (created_at),
  INDEX idx_security_events_type (event_type),
  INDEX idx_security_events_severity (severity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
