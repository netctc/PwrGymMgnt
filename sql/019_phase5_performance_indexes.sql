-- Phase 5: Performance indexes for dashboard and high-traffic queries.
-- Guarded: only creates indexes when the target table and COLUMN_NAME exist.
-- JSON-only legacy compatibility table (shifts) may not have start_time column;
-- the conditional guard avoids errors on such tables.

SET @db = DATABASE();

-- Users: role + created_at for dashboard user listing
CREATE INDEX idx_users_role_created ON users (role, created_at);

-- Members: status + created_at for dashboard membership summary
CREATE INDEX idx_members_status_created ON members (status, created_at);

-- Member subscriptions: status + end_date + member_id for access/expiry checks
CREATE INDEX idx_member_subscriptions_status_end_member ON member_subscriptions (status, end_date, member_id);

-- Class sessions: time + status + trainer for schedule queries
CREATE INDEX idx_class_sessions_time_status_trainer ON class_sessions (start_time, status, trainer_id);

-- Private sessions: time + status + trainer for schedule queries
CREATE INDEX idx_private_sessions_time_status_trainer ON private_sessions (start_time, status, trainer_id);

-- Shifts: conditional index only if start_time column exists (JSON-only legacy compatibility table may lack it)
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'shifts' AND COLUMN_NAME = 'start_time');
SET @sql = IF(@col_exists > 0, 'CREATE INDEX idx_shifts_time_user ON shifts (start_time, user_id)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Finance transactions: date + status + type for filtered reports
CREATE INDEX idx_finance_tx_date_status_type ON finance_transactions (transaction_date, status, type);
