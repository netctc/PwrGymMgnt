-- Multi-affiliation selection and duplicate-consumption safeguards.

INSERT INTO maintenance_lists
  (id, list_key, name_en, name_ar, description_en, description_ar, status)
VALUES
  (
    'ml_consumption_deduplication',
    'consumption_deduplication',
    'Consumption duplicate prevention',
    'منع تكرار استهلاك الجلسات',
    'Database-backed time windows used to reject repeated access, booking and reservation events.',
    'فترات زمنية مخزنة في قاعدة البيانات لمنع تكرار الدخول والحجز وحركات الجلسات.',
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
    'mli_dedupe_access',
    'ml_consumption_deduplication',
    'access_control',
    'Repeated access scan',
    'تكرار قراءة الدخول',
    10,
    'active',
    1,
    JSON_OBJECT('seconds', 60)
  ),
  (
    'mli_dedupe_booking',
    'ml_consumption_deduplication',
    'booking_activity',
    'Repeated booking activity',
    'تكرار نشاط الحجز',
    20,
    'active',
    1,
    JSON_OBJECT('seconds', 300)
  ),
  (
    'mli_reservation_lock',
    'ml_consumption_deduplication',
    'reservation_lock',
    'Reserved session lock',
    'قفل الجلسة المحجوزة',
    30,
    'active',
    1,
    JSON_OBJECT('seconds', 86400)
  )
ON DUPLICATE KEY UPDATE
  label_en = VALUES(label_en),
  label_ar = VALUES(label_ar),
  sort_order = VALUES(sort_order),
  status = VALUES(status);

CREATE TABLE IF NOT EXISTS access_replay_locks (
  person_id       VARCHAR(255) NOT NULL,
  access_point_id VARCHAR(64)  NOT NULL,
  last_seen_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (person_id, access_point_id),
  INDEX idx_access_replay_seen (last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS session_activity_claims (
  activity_key    VARCHAR(190) NOT NULL,
  affiliation_id VARCHAR(64)   NOT NULL,
  reference_type VARCHAR(64)   NOT NULL,
  reference_id   VARCHAR(128)  NOT NULL,
  movement_type  VARCHAR(32)   NOT NULL,
  movement_id    VARCHAR(64)   NULL,
  expires_at     DATETIME      NULL,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (activity_key),
  UNIQUE KEY uq_session_activity_reference
    (affiliation_id, reference_type, reference_id, movement_type),
  INDEX idx_session_activity_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
