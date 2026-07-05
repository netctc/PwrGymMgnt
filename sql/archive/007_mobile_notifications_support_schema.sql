-- Delivery 8: Mobile readiness, notifications, support workflow and deployment readiness

CREATE TABLE IF NOT EXISTS support_tickets (
  id VARCHAR(64) PRIMARY KEY,
  ticket_number VARCHAR(32) UNIQUE NOT NULL,
  requester_name VARCHAR(160) NOT NULL,
  requester_email VARCHAR(255) NOT NULL,
  requester_phone VARCHAR(50) NULL,
  inquiry_type VARCHAR(40) NOT NULL DEFAULT 'technical',
  priority VARCHAR(20) NOT NULL DEFAULT 'normal',
  subject VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  assigned_to VARCHAR(255) NULL,
  created_by VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  data JSON NULL,
  INDEX idx_support_tickets_status (status),
  INDEX idx_support_tickets_type (inquiry_type),
  INDEX idx_support_tickets_created_at (created_at),
  INDEX idx_support_tickets_requester_email (requester_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id VARCHAR(64) PRIMARY KEY,
  ticket_id VARCHAR(64) NOT NULL,
  author_email VARCHAR(255) NULL,
  author_role VARCHAR(64) NULL,
  message TEXT NOT NULL,
  visibility VARCHAR(32) NOT NULL DEFAULT 'public',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  data JSON NULL,
  INDEX idx_support_ticket_messages_ticket (ticket_id),
  CONSTRAINT fk_support_ticket_messages_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(255) NULL,
  role VARCHAR(64) NULL,
  title VARCHAR(180) NOT NULL,
  body TEXT NOT NULL,
  type VARCHAR(64) NOT NULL DEFAULT 'info',
  channel VARCHAR(64) NOT NULL DEFAULT 'in_app',
  link_url VARCHAR(255) NULL,
  read_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NULL,
  data JSON NULL,
  INDEX idx_notifications_user_read (user_id, read_at),
  INDEX idx_notifications_role_read (role, read_at),
  INDEX idx_notifications_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id VARCHAR(255) PRIMARY KEY,
  in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  class_reminders BOOLEAN NOT NULL DEFAULT TRUE,
  billing_reminders BOOLEAN NOT NULL DEFAULT TRUE,
  support_updates BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data JSON NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS deployment_checklist (
  id VARCHAR(64) PRIMARY KEY,
  item_key VARCHAR(120) UNIQUE NOT NULL,
  label VARCHAR(255) NOT NULL,
  category VARCHAR(80) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  details TEXT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
