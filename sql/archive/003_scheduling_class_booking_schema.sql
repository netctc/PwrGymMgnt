-- PowerGym Management - Delivery 4 Scheduling and Class Booking schema

CREATE TABLE IF NOT EXISTS class_sessions (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  trainer_id VARCHAR(255) NULL,
  trainer_name VARCHAR(160) NULL,
  capacity INT NOT NULL DEFAULT 0,
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  room VARCHAR(120) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'scheduled',
  class_type VARCHAR(80) NULL,
  level VARCHAR(80) NULL,
  branch VARCHAR(120) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data JSON NULL,
  INDEX idx_class_sessions_time (start_time, end_time),
  INDEX idx_class_sessions_trainer_time (trainer_id, start_time),
  INDEX idx_class_sessions_room_time (room, start_time),
  INDEX idx_class_sessions_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS class_bookings (
  id VARCHAR(64) PRIMARY KEY,
  class_id VARCHAR(64) NOT NULL,
  member_id VARCHAR(255) NOT NULL,
  member_name VARCHAR(180) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'booked',
  booked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  cancelled_at DATETIME NULL,
  data JSON NULL,
  UNIQUE KEY uq_class_bookings_active_member (class_id, member_id, status),
  INDEX idx_class_bookings_class (class_id),
  INDEX idx_class_bookings_member (member_id),
  CONSTRAINT fk_class_bookings_class FOREIGN KEY (class_id) REFERENCES class_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS private_sessions (
  id VARCHAR(64) PRIMARY KEY,
  series_id VARCHAR(64) NULL,
  member_id VARCHAR(255) NOT NULL,
  member_name VARCHAR(180) NULL,
  trainer_id VARCHAR(255) NOT NULL,
  trainer_name VARCHAR(180) NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  room VARCHAR(120) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'scheduled',
  level VARCHAR(80) NULL,
  branch VARCHAR(120) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data JSON NULL,
  INDEX idx_private_sessions_time (start_time, end_time),
  INDEX idx_private_sessions_trainer_time (trainer_id, start_time),
  INDEX idx_private_sessions_member_time (member_id, start_time),
  INDEX idx_private_sessions_room_time (room, start_time),
  INDEX idx_private_sessions_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
