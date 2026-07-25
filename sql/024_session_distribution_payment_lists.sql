-- Session distribution, deduction moments and subscription payment statuses.
-- Safe to run repeatedly after 021_plan_management_and_list_maintenance.sql.

SET NAMES utf8mb4;

INSERT IGNORE INTO maintenance_lists
  (id, list_key, name_en, name_ar, description_en, description_ar, status)
VALUES
  ('ml_payment_status', 'payment_status', 'Payment statuses', 'حالات الدفع',
   'Payment state of a subscription.', 'حالة دفع الاشتراك.', 'active'),
  ('ml_deduction_moment', 'deduction_moment', 'Session deduction moments', 'وقت خصم الجلسة',
   'Event that reserves or consumes a session.', 'الحدث الذي يحجز أو يستهلك الجلسة.', 'active'),
  ('ml_consumption_source', 'consumption_source', 'Session movement sources', 'مصادر حركة الجلسات',
   'Origin of an automatic or manual session movement.', 'مصدر حركة الجلسة الآلية أو اليدوية.', 'active');

INSERT IGNORE INTO maintenance_list_items
  (id, list_id, item_code, label_en, label_ar, sort_order, status, is_system)
VALUES
  ('mli_cycle_quarterly', 'ml_cycle_frequency', 'quarterly', 'Quarterly', 'ربع سنوي', 30, 'active', 1),
  ('mli_cycle_plan_duration', 'ml_cycle_frequency', 'plan_duration', 'Full plan duration', 'مدة الخطة كاملة', 40, 'active', 1),
  ('mli_payment_pending', 'ml_payment_status', 'pending', 'Pending', 'قيد الانتظار', 10, 'active', 1),
  ('mli_payment_partial', 'ml_payment_status', 'partial', 'Partially paid', 'مدفوع جزئياً', 20, 'active', 1),
  ('mli_payment_paid', 'ml_payment_status', 'paid', 'Paid', 'مدفوع', 30, 'active', 1),
  ('mli_payment_overdue', 'ml_payment_status', 'overdue', 'Overdue', 'متأخر', 40, 'active', 1),
  ('mli_payment_waived', 'ml_payment_status', 'waived', 'Waived', 'معفى', 50, 'active', 1),
  ('mli_payment_refunded', 'ml_payment_status', 'refunded', 'Refunded', 'مسترد', 60, 'active', 1),
  ('mli_deduct_reservation', 'ml_deduction_moment', 'reservation', 'When booking', 'عند الحجز', 10, 'active', 1),
  ('mli_deduct_confirmation', 'ml_deduction_moment', 'booking_confirmation', 'When booking is confirmed', 'عند تأكيد الحجز', 20, 'active', 1),
  ('mli_deduct_entry', 'ml_deduction_moment', 'check_in', 'At check-in', 'عند تسجيل الدخول', 30, 'active', 1),
  ('mli_deduct_start', 'ml_deduction_moment', 'service_start', 'When the activity starts', 'عند بدء النشاط', 40, 'active', 1),
  ('mli_deduct_attendance', 'ml_deduction_moment', 'attendance_confirmation', 'When attendance is confirmed', 'عند تأكيد الحضور', 50, 'active', 1),
  ('mli_deduct_completion', 'ml_deduction_moment', 'service_completion', 'When the activity finishes', 'عند انتهاء النشاط', 60, 'active', 1),
  ('mli_source_access', 'ml_consumption_source', 'access_control', 'Access control', 'التحكم بالدخول', 10, 'active', 1),
  ('mli_source_qr', 'ml_consumption_source', 'qr', 'QR code', 'رمز QR', 20, 'active', 1),
  ('mli_source_card', 'ml_consumption_source', 'card', 'Membership card', 'بطاقة العضوية', 30, 'active', 1),
  ('mli_source_biometric', 'ml_consumption_source', 'biometric', 'Biometric identification', 'التعريف البيومتري', 40, 'active', 1),
  ('mli_source_booking', 'ml_consumption_source', 'booking', 'Booking integration', 'تكامل الحجوزات', 50, 'active', 1),
  ('mli_source_reception', 'ml_consumption_source', 'reception', 'Reception validation', 'اعتماد الاستقبال', 60, 'active', 1),
  ('mli_source_system', 'ml_consumption_source', 'system', 'System process', 'عملية النظام', 70, 'active', 1);
