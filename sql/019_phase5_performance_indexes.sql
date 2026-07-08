SET @db = DATABASE();

-- Users: role + created_at
SET @idx_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_users_role_created'
);
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_users_role_created ON users (role, created_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Members: status + created_at
SET @idx_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'members' AND INDEX_NAME = 'idx_members_status_created'
);
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_members_status_created ON members (status, created_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Member subscriptions: status + end_date + member_id
SET @idx_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'member_subscriptions' AND INDEX_NAME = 'idx_member_subscriptions_status_end_member'
);
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_member_subscriptions_status_end_member ON member_subscriptions (status, end_date, member_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Class sessions: start_time + status + trainer_id
SET @idx_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'class_sessions' AND INDEX_NAME = 'idx_class_sessions_time_status_trainer'
);
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_class_sessions_time_status_trainer ON class_sessions (start_time, status, trainer_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Private sessions: start_time + status + trainer_id
SET @idx_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'private_sessions' AND INDEX_NAME = 'idx_private_sessions_time_status_trainer'
);
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_private_sessions_time_status_trainer ON private_sessions (start_time, status, trainer_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Shifts: only if start_time exists
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'shifts' AND COLUMN_NAME = 'start_time'
);
SET @idx_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'shifts' AND INDEX_NAME = 'idx_shifts_time_user'
);
SET @sql = IF(@col_exists > 0 AND @idx_exists = 0, 'CREATE INDEX idx_shifts_time_user ON shifts (start_time, user_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Finance transactions: transaction_date + status + type
SET @idx_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'finance_transactions' AND INDEX_NAME = 'idx_finance_tx_date_status_type'
);
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_finance_tx_date_status_type ON finance_transactions (transaction_date, status, type)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
