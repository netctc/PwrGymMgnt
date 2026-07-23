-- PowerGym Codex - Membership plan management and database-backed list maintenance
-- Compatible with MySQL 5.7+ / MariaDB 10.3+

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS maintenance_lists (
  id VARCHAR(64) PRIMARY KEY,
  list_key VARCHAR(120) NOT NULL,
  name_en VARCHAR(180) NOT NULL,
  name_ar VARCHAR(180) NOT NULL,
  description_en VARCHAR(512) NULL,
  description_ar VARCHAR(512) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_maintenance_lists_key (list_key),
  INDEX idx_maintenance_lists_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS maintenance_list_items (
  id VARCHAR(64) PRIMARY KEY,
  list_id VARCHAR(64) NOT NULL,
  item_code VARCHAR(120) NOT NULL,
  label_en VARCHAR(180) NOT NULL,
  label_ar VARCHAR(180) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_maintenance_item_code (list_id, item_code),
  INDEX idx_maintenance_items_list (list_id, status, sort_order),
  CONSTRAINT fk_maintenance_items_list
    FOREIGN KEY (list_id) REFERENCES maintenance_lists(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subscription_member_history (
  id VARCHAR(64) PRIMARY KEY,
  subscription_id VARCHAR(64) NOT NULL,
  subscription_member_id VARCHAR(64) NULL,
  member_id VARCHAR(255) NOT NULL,
  action VARCHAR(64) NOT NULL,
  previous_status VARCHAR(32) NULL,
  new_status VARCHAR(32) NULL,
  effective_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  performed_by VARCHAR(255) NULL,
  details JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_member_history_subscription (subscription_id, created_at),
  INDEX idx_member_history_member (member_id, created_at),
  CONSTRAINT fk_member_history_subscription
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO maintenance_lists
  (id, list_key, name_en, name_ar, description_en, description_ar, status)
VALUES
  ('ml_plan_type', 'plan_type', 'Plan types', 'أنواع الخطط', 'Membership plan classifications.', 'تصنيفات خطط العضوية.', 'active'),
  ('ml_plan_status', 'plan_status', 'Plan statuses', 'حالات الخطط', 'Membership plan lifecycle statuses.', 'حالات دورة حياة خطة العضوية.', 'active'),
  ('ml_cycle_frequency', 'cycle_frequency', 'Cycle frequencies', 'دورية الدورة', 'Session and billing cycle frequencies.', 'دورية دورات الجلسات والفوترة.', 'active'),
  ('ml_distribution_model', 'distribution_model', 'Benefit distribution', 'توزيع المزايا', 'How benefits are assigned in multi-user plans.', 'كيفية توزيع المزايا في الخطط متعددة المستخدمين.', 'active'),
  ('ml_member_status', 'subscription_member_status', 'Member statuses', 'حالات أعضاء الاشتراك', 'Individual status within a multi-user subscription.', 'الحالة الفردية ضمن الاشتراك متعدد المستخدمين.', 'active'),
  ('ml_future_booking', 'future_booking_policy', 'Future booking policies', 'سياسات الحجوزات المستقبلية', 'Action applied to future reservations when a member leaves.', 'الإجراء المطبق على الحجوزات المستقبلية عند مغادرة العضو.', 'active');

INSERT IGNORE INTO maintenance_list_items
  (id, list_id, item_code, label_en, label_ar, sort_order, status, is_system)
VALUES
  ('mli_plan_individual', 'ml_plan_type', 'individual', 'Individual', 'فردية', 10, 'active', 1),
  ('mli_plan_family', 'ml_plan_type', 'family', 'Family', 'عائلية', 20, 'active', 1),
  ('mli_plan_group', 'ml_plan_type', 'group', 'Group', 'جماعية', 30, 'active', 1),
  ('mli_plan_corporate', 'ml_plan_type', 'corporate', 'Corporate', 'شركات', 40, 'active', 1),
  ('mli_status_draft', 'ml_plan_status', 'draft', 'Draft', 'مسودة', 10, 'active', 1),
  ('mli_status_active', 'ml_plan_status', 'active', 'Active', 'نشطة', 20, 'active', 1),
  ('mli_status_suspended', 'ml_plan_status', 'suspended', 'Suspended', 'معلقة', 30, 'active', 1),
  ('mli_status_cancelled', 'ml_plan_status', 'cancelled', 'Cancelled', 'ملغاة', 40, 'active', 1),
  ('mli_status_archived', 'ml_plan_status', 'archived', 'Archived', 'مؤرشفة', 50, 'active', 1),
  ('mli_cycle_monthly', 'ml_cycle_frequency', 'monthly', 'Monthly', 'شهرياً', 10, 'active', 1),
  ('mli_cycle_weekly', 'ml_cycle_frequency', 'weekly', 'Weekly', 'أسبوعياً', 20, 'active', 1),
  ('mli_cycle_subscription', 'ml_cycle_frequency', 'subscription', 'Full subscription', 'مدة الاشتراك كاملة', 30, 'active', 1),
  ('mli_distribution_individual', 'ml_distribution_model', 'individual', 'Individual allocation', 'تخصيص فردي', 10, 'active', 1),
  ('mli_distribution_shared', 'ml_distribution_model', 'shared', 'Shared benefits', 'مزايا مشتركة', 20, 'active', 1),
  ('mli_distribution_custom', 'ml_distribution_model', 'custom', 'Member exceptions', 'استثناءات حسب العضو', 30, 'active', 1),
  ('mli_member_active', 'ml_member_status', 'active', 'Active', 'نشط', 10, 'active', 1),
  ('mli_member_suspended', 'ml_member_status', 'suspended', 'Suspended', 'معلق', 20, 'active', 1),
  ('mli_member_removed', 'ml_member_status', 'removed', 'Removed', 'تمت إزالته', 30, 'active', 1),
  ('mli_booking_cancel', 'ml_future_booking', 'cancel', 'Cancel future bookings', 'إلغاء الحجوزات المستقبلية', 10, 'active', 1),
  ('mli_booking_keep', 'ml_future_booking', 'keep', 'Keep future bookings', 'الإبقاء على الحجوزات المستقبلية', 20, 'active', 1),
  ('mli_booking_review', 'ml_future_booking', 'manual_review', 'Send to manual review', 'إرسال للمراجعة اليدوية', 30, 'active', 1);

