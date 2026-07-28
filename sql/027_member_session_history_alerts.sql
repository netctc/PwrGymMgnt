SET NAMES utf8mb4;

INSERT INTO maintenance_lists
  (id, list_key, name_en, name_ar, description_en, description_ar, status)
VALUES
  (
    'ml_session_expiry_alerts',
    'session_expiry_alerts',
    'Session expiry alerts',
    'تنبيهات انتهاء الجلسات',
    'Controls how many days before cycle expiry members and reception are warned.',
    'تحدد عدد الأيام قبل انتهاء دورة الجلسات لتنبيه الأعضاء والاستقبال.',
    'active'
  )
ON DUPLICATE KEY UPDATE
  name_en = VALUES(name_en),
  name_ar = VALUES(name_ar),
  description_en = VALUES(description_en),
  description_ar = VALUES(description_ar),
  status = VALUES(status);

INSERT INTO maintenance_list_items
  (id, list_id, item_code, label_en, label_ar, sort_order, status, is_system, metadata)
VALUES
  (
    'mli_session_expiry_warning_days',
    'ml_session_expiry_alerts',
    'warning_days',
    'Warning period (7 days)',
    'فترة التنبيه (7 أيام)',
    10,
    'active',
    1,
    JSON_OBJECT('days', 7, 'minimum', 1, 'maximum', 90)
  )
ON DUPLICATE KEY UPDATE
  label_en = VALUES(label_en),
  label_ar = VALUES(label_ar),
  sort_order = VALUES(sort_order),
  status = VALUES(status),
  metadata = VALUES(metadata);
