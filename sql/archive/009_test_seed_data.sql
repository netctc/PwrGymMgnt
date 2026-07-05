-- PowerGym Management - Datos de prueba / Test Seed Data
-- Archivo generado para Delivery 9+ MySQL.
-- Ejecutar DESPUES de npm run db:migrate y con la base de datos correcta seleccionada.
-- Ejemplo Windows:
--   mysql -u root -p powergym < sql/009_test_seed_data.sql
--
-- Contenido:
--   - 20 miembros con estados y validez diferentes
--   - staff/usuarios/empleados, uno por role/categoria principal
--   - clases grupales, clases privadas, reservas de salas y entrenadores
--   - planes, suscripciones, facturas, tokens QR, turnos, nomina, finanzas,
--     settings, notificaciones, soporte y datos operativos auxiliares
--
-- El seed usa IDs con prefijo seed_ y es idempotente: puede ejecutarse varias veces.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- Tablas genericas usadas por la capa de compatibilidad Firestore -> MySQL.
CREATE TABLE IF NOT EXISTS settings (
  id VARCHAR(255) PRIMARY KEY,
  data JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shifts (
  id VARCHAR(255) PRIMARY KEY,
  data JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS appSettings (
  id VARCHAR(255) PRIMARY KEY,
  data JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hr_profiles (
  id VARCHAR(255) PRIMARY KEY,
  data JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Compatibilidad: si class_bookings fue creado por una migracion base antigua,
-- puede faltarle member_name/cancelled_at. Usamos sintaxis compatible con MariaDB
-- y con el runner Node mysql2; no usar DELIMITER aqui.
ALTER TABLE class_bookings ADD COLUMN IF NOT EXISTS member_name VARCHAR(180) NULL;
ALTER TABLE class_bookings ADD COLUMN IF NOT EXISTS cancelled_at DATETIME NULL;

-- Limpieza solo de datos seed_ para evitar duplicados sin tocar datos reales.
DELETE FROM support_ticket_messages WHERE id LIKE 'seed_%' OR ticket_id LIKE 'seed_%';
DELETE FROM support_tickets WHERE id LIKE 'seed_%';
DELETE FROM notifications WHERE id LIKE 'seed_%';
DELETE FROM notification_preferences WHERE user_id LIKE 'seed_%';
DELETE FROM deployment_checklist WHERE id LIKE 'seed_%' OR item_key LIKE 'seed_%';
DELETE FROM security_events WHERE event_type LIKE 'seed_%' OR actor_email LIKE '%@powergym.test';
DELETE FROM security_audit_events WHERE actor_email LIKE '%@powergym.test' OR request_id LIKE 'seed_%';
DELETE FROM payroll_items WHERE id LIKE 'seed_%' OR payroll_run_id LIKE 'seed_%';
DELETE FROM payroll_runs WHERE id LIKE 'seed_%';
DELETE FROM employee_attendance WHERE id LIKE 'seed_%' OR employee_id LIKE 'seed_%';
DELETE FROM finance_transactions WHERE id LIKE 'seed_%' OR reference_id LIKE 'seed_%';
DELETE FROM finance_budgets WHERE id LIKE 'seed_%';
DELETE FROM finance_recurring_entries WHERE id LIKE 'seed_%';
DELETE FROM finance_loans WHERE id LIKE 'seed_%';
DELETE FROM finance_rentals WHERE id LIKE 'seed_%';
DELETE FROM private_sessions WHERE id LIKE 'seed_%' OR series_id LIKE 'seed_%';
DELETE FROM class_bookings WHERE id LIKE 'seed_%' OR class_id LIKE 'seed_%' OR member_id LIKE 'seed_%';
DELETE FROM class_sessions WHERE id LIKE 'seed_%';
DELETE FROM classes WHERE id LIKE 'seed_%';
DELETE FROM access_tokens WHERE id LIKE 'seed_%' OR member_id LIKE 'seed_%';
DELETE FROM invoices WHERE id LIKE 'seed_%' OR member_id LIKE 'seed_%' OR subscription_id LIKE 'seed_%';
DELETE FROM member_subscriptions WHERE id LIKE 'seed_%' OR member_id LIKE 'seed_%';
DELETE FROM subscriptions WHERE id LIKE 'seed_%' OR member_id LIKE 'seed_%';
DELETE FROM members WHERE id LIKE 'seed_%';
DELETE FROM subscription_plans WHERE id LIKE 'seed_%';
DELETE FROM plans WHERE id LIKE 'seed_%';
DELETE FROM shifts WHERE id LIKE 'seed_%';
DELETE FROM hr_profiles WHERE id LIKE 'seed_%';
DELETE FROM settings WHERE id = 'general';
DELETE FROM appSettings WHERE id = 'general';
DELETE FROM employees WHERE id LIKE 'seed_%';
DELETE FROM staff WHERE id LIKE 'seed_%';
DELETE FROM users WHERE id LIKE 'seed_%';
DELETE FROM audit_logs WHERE performed_by LIKE 'seed_%' OR details LIKE '%seed_%';

SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO settings (id, data) VALUES
  ('general', '{"gymName":"PowerGym Management - Demo","staffRoles":["super_admin","admin","manager","reception","trainer","accounting","hr","support","sales","maintenance"],"departments":["Management","Front Desk","Training","Finance","Human Resources","Operations","Sales","Support","Maintenance","Cleaning"],"rooms":["Main Studio","Strength Room","Cycling Room","Yoga Room","Personal Training Area","Sala A","Sala B","Box Exterior"],"seedVersion":"009_test_seed_data"}')
ON DUPLICATE KEY UPDATE data = VALUES(data);

INSERT INTO appSettings (id, data) VALUES
  ('general', '{"gymName":"PowerGym Management - Demo","seedVersion":"009_test_seed_data","note":"Mirror of settings.general for compatibility"}')
ON DUPLICATE KEY UPDATE data = VALUES(data);

INSERT INTO subscription_plans (id, name, description, duration_days, price, currency, status, data) VALUES
  ('seed_plan_basic', 'Basic Monthly', 'Accesso general mensual', 30, 39.00, 'USD', 'active', '{"source":"seed","durationDays":30}'),
  ('seed_plan_standard', 'Standard Monthly', 'Acceso general + 4 clases grupales', 30, 59.00, 'USD', 'active', '{"source":"seed","durationDays":30}'),
  ('seed_plan_premium', 'Premium Monthly', 'Acceso completo + clases ilimitadas', 30, 89.00, 'USD', 'active', '{"source":"seed","durationDays":30}'),
  ('seed_plan_quarterly', 'Quarterly Fitness', 'Plan trimestral con descuento', 90, 229.00, 'USD', 'active', '{"source":"seed","durationDays":90}'),
  ('seed_plan_annual', 'Annual Elite', 'Plan anual completo', 365, 799.00, 'USD', 'active', '{"source":"seed","durationDays":365}'),
  ('seed_plan_trial', '7 Day Trial', 'Prueba inicial de 7 dias', 7, 0.00, 'USD', 'active', '{"source":"seed","durationDays":7}'),
  ('seed_plan_archived', 'Legacy Corporate', 'Plan antiguo para pruebas', 365, 499.00, 'USD', 'archived', '{"source":"seed","durationDays":365}')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), duration_days = VALUES(duration_days), price = VALUES(price), currency = VALUES(currency), status = VALUES(status), data = VALUES(data);

INSERT INTO plans (id, name, price, duration_days, status, data) VALUES
  ('seed_plan_basic', 'Basic Monthly', 39.00, 30, 'active', '{"description":"Accesso general mensual","currency":"USD","source":"seed"}'),
  ('seed_plan_standard', 'Standard Monthly', 59.00, 30, 'active', '{"description":"Acceso general + 4 clases grupales","currency":"USD","source":"seed"}'),
  ('seed_plan_premium', 'Premium Monthly', 89.00, 30, 'active', '{"description":"Acceso completo + clases ilimitadas","currency":"USD","source":"seed"}'),
  ('seed_plan_quarterly', 'Quarterly Fitness', 229.00, 90, 'active', '{"description":"Plan trimestral con descuento","currency":"USD","source":"seed"}'),
  ('seed_plan_annual', 'Annual Elite', 799.00, 365, 'active', '{"description":"Plan anual completo","currency":"USD","source":"seed"}'),
  ('seed_plan_trial', '7 Day Trial', 0.00, 7, 'active', '{"description":"Prueba inicial de 7 dias","currency":"USD","source":"seed"}'),
  ('seed_plan_archived', 'Legacy Corporate', 499.00, 365, 'archived', '{"description":"Plan antiguo para pruebas","currency":"USD","source":"seed"}')
ON DUPLICATE KEY UPDATE name = VALUES(name), price = VALUES(price), duration_days = VALUES(duration_days), status = VALUES(status), data = VALUES(data);

INSERT INTO users (id, email, role, data) VALUES
  ('seed_staff_super_admin', 'nadia.superadmin@powergym.test', 'super_admin', '{"id":"seed_staff_super_admin","firstName":"Nadia","lastName":"Mansour","email":"nadia.superadmin@powergym.test","role":"super_admin","department":"Management","jobTitle":"General Director","status":"active","phone":"+961-70-1001","createdAt":"seed"}'),
  ('seed_staff_admin', 'karim.admin@powergym.test', 'admin', '{"id":"seed_staff_admin","firstName":"Karim","lastName":"Haddad","email":"karim.admin@powergym.test","role":"admin","department":"Management","jobTitle":"Operations Admin","status":"active","phone":"+961-70-1002","createdAt":"seed"}'),
  ('seed_staff_manager', 'rana.manager@powergym.test', 'manager', '{"id":"seed_staff_manager","firstName":"Rana","lastName":"Khalil","email":"rana.manager@powergym.test","role":"manager","department":"Operations","jobTitle":"Branch Manager","status":"active","phone":"+961-70-1003","createdAt":"seed"}'),
  ('seed_staff_reception', 'maya.reception@powergym.test', 'reception', '{"id":"seed_staff_reception","firstName":"Maya","lastName":"Saad","email":"maya.reception@powergym.test","role":"reception","department":"Front Desk","jobTitle":"Receptionist","status":"active","phone":"+961-70-1004","createdAt":"seed"}'),
  ('seed_staff_trainer', 'omar.trainer@powergym.test', 'trainer', '{"id":"seed_staff_trainer","firstName":"Omar","lastName":"Nasser","email":"omar.trainer@powergym.test","role":"trainer","department":"Training","jobTitle":"Senior Trainer","status":"active","phone":"+961-70-1005","createdAt":"seed"}'),
  ('seed_staff_accounting', 'lea.accounting@powergym.test', 'accounting', '{"id":"seed_staff_accounting","firstName":"Lea","lastName":"Fares","email":"lea.accounting@powergym.test","role":"accounting","department":"Finance","jobTitle":"Accountant","status":"active","phone":"+961-70-1006","createdAt":"seed"}'),
  ('seed_staff_hr', 'tarek.hr@powergym.test', 'hr', '{"id":"seed_staff_hr","firstName":"Tarek","lastName":"Aoun","email":"tarek.hr@powergym.test","role":"hr","department":"Human Resources","jobTitle":"HR Officer","status":"active","phone":"+961-70-1007","createdAt":"seed"}'),
  ('seed_staff_support', 'sara.support@powergym.test', 'support', '{"id":"seed_staff_support","firstName":"Sara","lastName":"Youssef","email":"sara.support@powergym.test","role":"support","department":"Support","jobTitle":"Support Agent","status":"active","phone":"+961-70-1008","createdAt":"seed"}'),
  ('seed_staff_sales', 'george.sales@powergym.test', 'sales', '{"id":"seed_staff_sales","firstName":"George","lastName":"Abi","email":"george.sales@powergym.test","role":"sales","department":"Sales","jobTitle":"Membership Sales","status":"active","phone":"+961-70-1009","createdAt":"seed"}'),
  ('seed_staff_maintenance', 'bilal.maintenance@powergym.test', 'maintenance', '{"id":"seed_staff_maintenance","firstName":"Bilal","lastName":"Darwish","email":"bilal.maintenance@powergym.test","role":"maintenance","department":"Maintenance","jobTitle":"Facility Technician","status":"active","phone":"+961-70-1010","createdAt":"seed"}')
ON DUPLICATE KEY UPDATE email = VALUES(email), role = VALUES(role), data = VALUES(data);

INSERT INTO staff (id, first_name, last_name, email, role, status, data) VALUES
  ('seed_staff_super_admin', 'Nadia', 'Mansour', 'nadia.superadmin@powergym.test', 'super_admin', 'active', '{"id":"seed_staff_super_admin","firstName":"Nadia","lastName":"Mansour","department":"Management","jobTitle":"General Director","category":"Management","phone":"+961-70-1001","source":"seed"}'),
  ('seed_staff_admin', 'Karim', 'Haddad', 'karim.admin@powergym.test', 'admin', 'active', '{"id":"seed_staff_admin","firstName":"Karim","lastName":"Haddad","department":"Management","jobTitle":"Operations Admin","category":"Management","phone":"+961-70-1002","source":"seed"}'),
  ('seed_staff_manager', 'Rana', 'Khalil', 'rana.manager@powergym.test', 'manager', 'active', '{"id":"seed_staff_manager","firstName":"Rana","lastName":"Khalil","department":"Operations","jobTitle":"Branch Manager","category":"Operations","phone":"+961-70-1003","source":"seed"}'),
  ('seed_staff_reception', 'Maya', 'Saad', 'maya.reception@powergym.test', 'reception', 'active', '{"id":"seed_staff_reception","firstName":"Maya","lastName":"Saad","department":"Front Desk","jobTitle":"Receptionist","category":"Front Desk","phone":"+961-70-1004","source":"seed"}'),
  ('seed_staff_trainer', 'Omar', 'Nasser', 'omar.trainer@powergym.test', 'trainer', 'active', '{"id":"seed_staff_trainer","firstName":"Omar","lastName":"Nasser","department":"Training","jobTitle":"Senior Trainer","category":"Training","phone":"+961-70-1005","source":"seed"}'),
  ('seed_staff_accounting', 'Lea', 'Fares', 'lea.accounting@powergym.test', 'accounting', 'active', '{"id":"seed_staff_accounting","firstName":"Lea","lastName":"Fares","department":"Finance","jobTitle":"Accountant","category":"Finance","phone":"+961-70-1006","source":"seed"}'),
  ('seed_staff_hr', 'Tarek', 'Aoun', 'tarek.hr@powergym.test', 'hr', 'active', '{"id":"seed_staff_hr","firstName":"Tarek","lastName":"Aoun","department":"Human Resources","jobTitle":"HR Officer","category":"Human Resources","phone":"+961-70-1007","source":"seed"}'),
  ('seed_staff_support', 'Sara', 'Youssef', 'sara.support@powergym.test', 'support', 'active', '{"id":"seed_staff_support","firstName":"Sara","lastName":"Youssef","department":"Support","jobTitle":"Support Agent","category":"Support","phone":"+961-70-1008","source":"seed"}'),
  ('seed_staff_sales', 'George', 'Abi', 'george.sales@powergym.test', 'sales', 'active', '{"id":"seed_staff_sales","firstName":"George","lastName":"Abi","department":"Sales","jobTitle":"Membership Sales","category":"Sales","phone":"+961-70-1009","source":"seed"}'),
  ('seed_staff_maintenance', 'Bilal', 'Darwish', 'bilal.maintenance@powergym.test', 'maintenance', 'active', '{"id":"seed_staff_maintenance","firstName":"Bilal","lastName":"Darwish","department":"Maintenance","jobTitle":"Facility Technician","category":"Maintenance","phone":"+961-70-1010","source":"seed"}')
ON DUPLICATE KEY UPDATE first_name = VALUES(first_name), last_name = VALUES(last_name), email = VALUES(email), role = VALUES(role), status = VALUES(status), data = VALUES(data);

INSERT INTO employees (id, employee_code, first_name, last_name, email, phone, department, job_title, employment_status, contract_type, hire_date, base_salary, pay_frequency, allowance_housing, allowance_transport, allowance_medical, deduction_tax, deduction_insurance, vacation_days_remaining, data) VALUES
  ('seed_staff_super_admin', 'EMP-001', 'Nadia', 'Mansour', 'nadia.superadmin@powergym.test', '+961-70-1001', 'Management', 'General Director', 'active', 'full-time', DATE_ADD(CURDATE(), INTERVAL -385 DAY), 5200.00, 'monthly', 416.00, 208.00, 156.00, 260.00, 104.00, 17, '{"role":"super_admin","source":"seed"}'),
  ('seed_staff_admin', 'EMP-002', 'Karim', 'Haddad', 'karim.admin@powergym.test', '+961-70-1002', 'Management', 'Operations Admin', 'active', 'full-time', DATE_ADD(CURDATE(), INTERVAL -405 DAY), 4200.00, 'monthly', 336.00, 168.00, 126.00, 210.00, 84.00, 16, '{"role":"admin","source":"seed"}'),
  ('seed_staff_manager', 'EMP-003', 'Rana', 'Khalil', 'rana.manager@powergym.test', '+961-70-1003', 'Operations', 'Branch Manager', 'active', 'full-time', DATE_ADD(CURDATE(), INTERVAL -425 DAY), 3800.00, 'monthly', 304.00, 152.00, 114.00, 190.00, 76.00, 15, '{"role":"manager","source":"seed"}'),
  ('seed_staff_reception', 'EMP-004', 'Maya', 'Saad', 'maya.reception@powergym.test', '+961-70-1004', 'Front Desk', 'Receptionist', 'active', 'full-time', DATE_ADD(CURDATE(), INTERVAL -445 DAY), 1600.00, 'monthly', 128.00, 64.00, 48.00, 80.00, 32.00, 14, '{"role":"reception","source":"seed"}'),
  ('seed_staff_trainer', 'EMP-005', 'Omar', 'Nasser', 'omar.trainer@powergym.test', '+961-70-1005', 'Training', 'Senior Trainer', 'active', 'full-time', DATE_ADD(CURDATE(), INTERVAL -465 DAY), 2600.00, 'monthly', 208.00, 104.00, 78.00, 130.00, 52.00, 13, '{"role":"trainer","source":"seed"}'),
  ('seed_staff_accounting', 'EMP-006', 'Lea', 'Fares', 'lea.accounting@powergym.test', '+961-70-1006', 'Finance', 'Accountant', 'active', 'full-time', DATE_ADD(CURDATE(), INTERVAL -485 DAY), 2900.00, 'monthly', 232.00, 116.00, 87.00, 145.00, 58.00, 18, '{"role":"accounting","source":"seed"}'),
  ('seed_staff_hr', 'EMP-007', 'Tarek', 'Aoun', 'tarek.hr@powergym.test', '+961-70-1007', 'Human Resources', 'HR Officer', 'active', 'full-time', DATE_ADD(CURDATE(), INTERVAL -505 DAY), 2800.00, 'monthly', 224.00, 112.00, 84.00, 140.00, 56.00, 17, '{"role":"hr","source":"seed"}'),
  ('seed_staff_support', 'EMP-008', 'Sara', 'Youssef', 'sara.support@powergym.test', '+961-70-1008', 'Support', 'Support Agent', 'active', 'part-time', DATE_ADD(CURDATE(), INTERVAL -525 DAY), 1800.00, 'monthly', 144.00, 72.00, 54.00, 90.00, 36.00, 16, '{"role":"support","source":"seed"}'),
  ('seed_staff_sales', 'EMP-009', 'George', 'Abi', 'george.sales@powergym.test', '+961-70-1009', 'Sales', 'Membership Sales', 'active', 'full-time', DATE_ADD(CURDATE(), INTERVAL -545 DAY), 2100.00, 'monthly', 168.00, 84.00, 63.00, 105.00, 42.00, 15, '{"role":"sales","source":"seed"}'),
  ('seed_staff_maintenance', 'EMP-010', 'Bilal', 'Darwish', 'bilal.maintenance@powergym.test', '+961-70-1010', 'Maintenance', 'Facility Technician', 'active', 'part-time', DATE_ADD(CURDATE(), INTERVAL -565 DAY), 1500.00, 'monthly', 120.00, 60.00, 45.00, 75.00, 30.00, 14, '{"role":"maintenance","source":"seed"}')
ON DUPLICATE KEY UPDATE employee_code = VALUES(employee_code), first_name = VALUES(first_name), last_name = VALUES(last_name), email = VALUES(email), phone = VALUES(phone), department = VALUES(department), job_title = VALUES(job_title), employment_status = VALUES(employment_status), contract_type = VALUES(contract_type), hire_date = VALUES(hire_date), base_salary = VALUES(base_salary), pay_frequency = VALUES(pay_frequency), allowance_housing = VALUES(allowance_housing), allowance_transport = VALUES(allowance_transport), allowance_medical = VALUES(allowance_medical), deduction_tax = VALUES(deduction_tax), deduction_insurance = VALUES(deduction_insurance), vacation_days_remaining = VALUES(vacation_days_remaining), data = VALUES(data);

INSERT INTO hr_profiles (id, data) VALUES
  ('seed_staff_super_admin', '{"userId":"seed_staff_super_admin","firstName":"Nadia","lastName":"Mansour","role":"super_admin","department":"Management","salary":5200,"status":"active","source":"seed"}'),
  ('seed_staff_admin', '{"userId":"seed_staff_admin","firstName":"Karim","lastName":"Haddad","role":"admin","department":"Management","salary":4200,"status":"active","source":"seed"}'),
  ('seed_staff_manager', '{"userId":"seed_staff_manager","firstName":"Rana","lastName":"Khalil","role":"manager","department":"Operations","salary":3800,"status":"active","source":"seed"}'),
  ('seed_staff_reception', '{"userId":"seed_staff_reception","firstName":"Maya","lastName":"Saad","role":"reception","department":"Front Desk","salary":1600,"status":"active","source":"seed"}'),
  ('seed_staff_trainer', '{"userId":"seed_staff_trainer","firstName":"Omar","lastName":"Nasser","role":"trainer","department":"Training","salary":2600,"status":"active","source":"seed"}'),
  ('seed_staff_accounting', '{"userId":"seed_staff_accounting","firstName":"Lea","lastName":"Fares","role":"accounting","department":"Finance","salary":2900,"status":"active","source":"seed"}'),
  ('seed_staff_hr', '{"userId":"seed_staff_hr","firstName":"Tarek","lastName":"Aoun","role":"hr","department":"Human Resources","salary":2800,"status":"active","source":"seed"}'),
  ('seed_staff_support', '{"userId":"seed_staff_support","firstName":"Sara","lastName":"Youssef","role":"support","department":"Support","salary":1800,"status":"active","source":"seed"}'),
  ('seed_staff_sales', '{"userId":"seed_staff_sales","firstName":"George","lastName":"Abi","role":"sales","department":"Sales","salary":2100,"status":"active","source":"seed"}'),
  ('seed_staff_maintenance', '{"userId":"seed_staff_maintenance","firstName":"Bilal","lastName":"Darwish","role":"maintenance","department":"Maintenance","salary":1500,"status":"active","source":"seed"}')
ON DUPLICATE KEY UPDATE data = VALUES(data);

INSERT INTO members (id, first_name, last_name, email, phone, status, join_date, plan, qr_code, data) VALUES
  ('seed_member_001', 'Adam', 'Saliba', 'adam.saliba@example.test', '+961-71-200001', 'active', DATE_ADD(CURDATE(), INTERVAL -120 DAY), 'Premium Monthly', 'QR-seed_member_001', '{"id":"seed_member_001","firstName":"Adam","lastName":"Saliba","email":"adam.saliba@example.test","phone":"+961-71-200001","status":"active","currentPlan":"Premium Monthly","planId":"seed_plan_premium","validityCase":"valid_future","joinDateOffsetDays":-120,"subscriptionEndOffsetDays":20,"source":"seed"}'),
  ('seed_member_002', 'Lina', 'Karam', 'lina.karam@example.test', '+961-71-200002', 'active', DATE_ADD(CURDATE(), INTERVAL -80 DAY), 'Standard Monthly', 'QR-seed_member_002', '{"id":"seed_member_002","firstName":"Lina","lastName":"Karam","email":"lina.karam@example.test","phone":"+961-71-200002","status":"active","currentPlan":"Standard Monthly","planId":"seed_plan_standard","validityCase":"valid_future","joinDateOffsetDays":-80,"subscriptionEndOffsetDays":8,"source":"seed"}'),
  ('seed_member_003', 'Joe', 'Khoury', 'joe.khoury@example.test', '+961-71-200003', 'expired', DATE_ADD(CURDATE(), INTERVAL -130 DAY), 'Basic Monthly', 'QR-seed_member_003', '{"id":"seed_member_003","firstName":"Joe","lastName":"Khoury","email":"joe.khoury@example.test","phone":"+961-71-200003","status":"expired","currentPlan":"Basic Monthly","planId":"seed_plan_basic","validityCase":"expired","joinDateOffsetDays":-130,"subscriptionEndOffsetDays":-2,"source":"seed"}'),
  ('seed_member_004', 'Mira', 'Ammar', 'mira.ammar@example.test', '+961-71-200004', 'suspended', DATE_ADD(CURDATE(), INTERVAL -40 DAY), 'Premium Monthly', 'QR-seed_member_004', '{"id":"seed_member_004","firstName":"Mira","lastName":"Ammar","email":"mira.ammar@example.test","phone":"+961-71-200004","status":"suspended","currentPlan":"Premium Monthly","planId":"seed_plan_premium","validityCase":"suspended_valid","joinDateOffsetDays":-40,"subscriptionEndOffsetDays":18,"source":"seed"}'),
  ('seed_member_005', 'Hadi', 'Sfeir', 'hadi.sfeir@example.test', '+961-71-200005', 'active', DATE_ADD(CURDATE(), INTERVAL -3 DAY), '7 Day Trial', 'QR-seed_member_005', '{"id":"seed_member_005","firstName":"Hadi","lastName":"Sfeir","email":"hadi.sfeir@example.test","phone":"+961-71-200005","status":"active","currentPlan":"7 Day Trial","planId":"seed_plan_trial","validityCase":"trial_valid","joinDateOffsetDays":-3,"subscriptionEndOffsetDays":4,"source":"seed"}'),
  ('seed_member_006', 'Yara', 'Nassar', 'yara.nassar@example.test', '+961-71-200006', 'paused', DATE_ADD(CURDATE(), INTERVAL -45 DAY), 'Quarterly Fitness', 'QR-seed_member_006', '{"id":"seed_member_006","firstName":"Yara","lastName":"Nassar","email":"yara.nassar@example.test","phone":"+961-71-200006","status":"paused","currentPlan":"Quarterly Fitness","planId":"seed_plan_quarterly","validityCase":"paused_valid","joinDateOffsetDays":-45,"subscriptionEndOffsetDays":45,"source":"seed"}'),
  ('seed_member_007', 'Samir', 'Fakhry', 'samir.fakhry@example.test', '+961-71-200007', 'active', DATE_ADD(CURDATE(), INTERVAL -220 DAY), 'Annual Elite', 'QR-seed_member_007', '{"id":"seed_member_007","firstName":"Samir","lastName":"Fakhry","email":"samir.fakhry@example.test","phone":"+961-71-200007","status":"active","currentPlan":"Annual Elite","planId":"seed_plan_annual","validityCase":"valid_long","joinDateOffsetDays":-220,"subscriptionEndOffsetDays":210,"source":"seed"}'),
  ('seed_member_008', 'Nour', 'Azar', 'nour.azar@example.test', '+961-71-200008', 'inactive', DATE_ADD(CURDATE(), INTERVAL -200 DAY), 'Basic Monthly', 'QR-seed_member_008', '{"id":"seed_member_008","firstName":"Nour","lastName":"Azar","email":"nour.azar@example.test","phone":"+961-71-200008","status":"inactive","currentPlan":"Basic Monthly","planId":"seed_plan_basic","validityCase":"inactive_expired","joinDateOffsetDays":-200,"subscriptionEndOffsetDays":-60,"source":"seed"}'),
  ('seed_member_009', 'Rami', 'Abi Raad', 'rami.abiraad@example.test', '+961-71-200009', 'active', DATE_ADD(CURDATE(), INTERVAL -60 DAY), 'Standard Monthly', 'QR-seed_member_009', '{"id":"seed_member_009","firstName":"Rami","lastName":"Abi Raad","email":"rami.abiraad@example.test","phone":"+961-71-200009","status":"active","currentPlan":"Standard Monthly","planId":"seed_plan_standard","validityCase":"renewal_soon","joinDateOffsetDays":-60,"subscriptionEndOffsetDays":2,"source":"seed"}'),
  ('seed_member_010', 'Dina', 'Mouawad', 'dina.mouawad@example.test', '+961-71-200010', 'archived', DATE_ADD(CURDATE(), INTERVAL -500 DAY), 'Legacy Corporate', 'QR-seed_member_010', '{"id":"seed_member_010","firstName":"Dina","lastName":"Mouawad","email":"dina.mouawad@example.test","phone":"+961-71-200010","status":"archived","currentPlan":"Legacy Corporate","planId":"seed_plan_archived","validityCase":"archived","joinDateOffsetDays":-500,"subscriptionEndOffsetDays":-300,"source":"seed"}'),
  ('seed_member_011', 'Fadi', 'Gerges', 'fadi.gerges@example.test', '+961-71-200011', 'active', DATE_ADD(CURDATE(), INTERVAL -20 DAY), 'Premium Monthly', 'QR-seed_member_011', '{"id":"seed_member_011","firstName":"Fadi","lastName":"Gerges","email":"fadi.gerges@example.test","phone":"+961-71-200011","status":"active","currentPlan":"Premium Monthly","planId":"seed_plan_premium","validityCase":"valid_future","joinDateOffsetDays":-20,"subscriptionEndOffsetDays":25,"source":"seed"}'),
  ('seed_member_012', 'Celine', 'Bitar', 'celine.bitar@example.test', '+961-71-200012', 'expired', DATE_ADD(CURDATE(), INTERVAL -90 DAY), 'Standard Monthly', 'QR-seed_member_012', '{"id":"seed_member_012","firstName":"Celine","lastName":"Bitar","email":"celine.bitar@example.test","phone":"+961-71-200012","status":"expired","currentPlan":"Standard Monthly","planId":"seed_plan_standard","validityCase":"expired","joinDateOffsetDays":-90,"subscriptionEndOffsetDays":-1,"source":"seed"}'),
  ('seed_member_013', 'Walid', 'Hanna', 'walid.hanna@example.test', '+961-71-200013', 'active', DATE_ADD(CURDATE(), INTERVAL -15 DAY), 'Basic Monthly', 'QR-seed_member_013', '{"id":"seed_member_013","firstName":"Walid","lastName":"Hanna","email":"walid.hanna@example.test","phone":"+961-71-200013","status":"active","currentPlan":"Basic Monthly","planId":"seed_plan_basic","validityCase":"valid_future","joinDateOffsetDays":-15,"subscriptionEndOffsetDays":15,"source":"seed"}'),
  ('seed_member_014', 'Rita', 'Chahine', 'rita.chahine@example.test', '+961-71-200014', 'active', DATE_ADD(CURDATE(), INTERVAL -75 DAY), 'Quarterly Fitness', 'QR-seed_member_014', '{"id":"seed_member_014","firstName":"Rita","lastName":"Chahine","email":"rita.chahine@example.test","phone":"+961-71-200014","status":"active","currentPlan":"Quarterly Fitness","planId":"seed_plan_quarterly","validityCase":"valid_future","joinDateOffsetDays":-75,"subscriptionEndOffsetDays":55,"source":"seed"}'),
  ('seed_member_015', 'Ziad', 'Matar', 'ziad.matar@example.test', '+961-71-200015', 'suspended', DATE_ADD(CURDATE(), INTERVAL -70 DAY), 'Basic Monthly', 'QR-seed_member_015', '{"id":"seed_member_015","firstName":"Ziad","lastName":"Matar","email":"ziad.matar@example.test","phone":"+961-71-200015","status":"suspended","currentPlan":"Basic Monthly","planId":"seed_plan_basic","validityCase":"suspended_expired","joinDateOffsetDays":-70,"subscriptionEndOffsetDays":-10,"source":"seed"}'),
  ('seed_member_016', 'Mona', 'Issa', 'mona.issa@example.test', '+961-71-200016', 'active', DATE_ADD(CURDATE(), INTERVAL -7 DAY), '7 Day Trial', 'QR-seed_member_016', '{"id":"seed_member_016","firstName":"Mona","lastName":"Issa","email":"mona.issa@example.test","phone":"+961-71-200016","status":"active","currentPlan":"7 Day Trial","planId":"seed_plan_trial","validityCase":"trial_expiring_today","joinDateOffsetDays":-7,"subscriptionEndOffsetDays":0,"source":"seed"}'),
  ('seed_member_017', 'Elias', 'Tannous', 'elias.tannous@example.test', '+961-71-200017', 'active', DATE_ADD(CURDATE(), INTERVAL -30 DAY), 'Annual Elite', 'QR-seed_member_017', '{"id":"seed_member_017","firstName":"Elias","lastName":"Tannous","email":"elias.tannous@example.test","phone":"+961-71-200017","status":"active","currentPlan":"Annual Elite","planId":"seed_plan_annual","validityCase":"valid_long","joinDateOffsetDays":-30,"subscriptionEndOffsetDays":330,"source":"seed"}'),
  ('seed_member_018', 'Hiba', 'Zeidan', 'hiba.zeidan@example.test', '+961-71-200018', 'paused', DATE_ADD(CURDATE(), INTERVAL -10 DAY), 'Premium Monthly', 'QR-seed_member_018', '{"id":"seed_member_018","firstName":"Hiba","lastName":"Zeidan","email":"hiba.zeidan@example.test","phone":"+961-71-200018","status":"paused","currentPlan":"Premium Monthly","planId":"seed_plan_premium","validityCase":"paused_future","joinDateOffsetDays":-10,"subscriptionEndOffsetDays":12,"source":"seed"}'),
  ('seed_member_019', 'Marwan', 'Sarkis', 'marwan.sarkis@example.test', '+961-71-200019', 'active', DATE_ADD(CURDATE(), INTERVAL -1 DAY), 'Standard Monthly', 'QR-seed_member_019', '{"id":"seed_member_019","firstName":"Marwan","lastName":"Sarkis","email":"marwan.sarkis@example.test","phone":"+961-71-200019","status":"active","currentPlan":"Standard Monthly","planId":"seed_plan_standard","validityCase":"new_member","joinDateOffsetDays":-1,"subscriptionEndOffsetDays":29,"source":"seed"}'),
  ('seed_member_020', 'Layal', 'Farah', 'layal.farah@example.test', '+961-71-200020', 'inactive', DATE_ADD(CURDATE(), INTERVAL -300 DAY), 'Basic Monthly', 'QR-seed_member_020', '{"id":"seed_member_020","firstName":"Layal","lastName":"Farah","email":"layal.farah@example.test","phone":"+961-71-200020","status":"inactive","currentPlan":"Basic Monthly","planId":"seed_plan_basic","validityCase":"no_active_subscription","joinDateOffsetDays":-300,"subscriptionEndOffsetDays":-120,"source":"seed"}')
ON DUPLICATE KEY UPDATE first_name = VALUES(first_name), last_name = VALUES(last_name), email = VALUES(email), phone = VALUES(phone), status = VALUES(status), join_date = VALUES(join_date), plan = VALUES(plan), qr_code = VALUES(qr_code), data = VALUES(data);

UPDATE members SET last_access_at = CASE id
  WHEN 'seed_member_001' THEN NOW()
  WHEN 'seed_member_002' THEN DATE_SUB(NOW(), INTERVAL 2 HOUR)
  WHEN 'seed_member_005' THEN DATE_SUB(NOW(), INTERVAL 1 HOUR)
  WHEN 'seed_member_009' THEN DATE_SUB(NOW(), INTERVAL 1 DAY)
  WHEN 'seed_member_011' THEN DATE_SUB(NOW(), INTERVAL 3 DAY)
  WHEN 'seed_member_013' THEN DATE_SUB(NOW(), INTERVAL 7 DAY)
  WHEN 'seed_member_016' THEN DATE_SUB(NOW(), INTERVAL 14 DAY)
  WHEN 'seed_member_019' THEN DATE_SUB(NOW(), INTERVAL 30 MINUTE)
  ELSE last_access_at
END
WHERE id LIKE 'seed_member_%';

INSERT INTO member_subscriptions (id, member_id, plan_id, plan_name, status, start_date, end_date, price, currency, data) VALUES
  ('seed_sub_001', 'seed_member_001', 'seed_plan_premium', 'Premium Monthly', 'active', DATE_ADD(CURDATE(), INTERVAL -120 DAY), DATE_ADD(CURDATE(), INTERVAL 20 DAY), 89.00, 'USD', '{"validityCase":"valid_future","source":"seed"}'),
  ('seed_sub_002', 'seed_member_002', 'seed_plan_standard', 'Standard Monthly', 'active', DATE_ADD(CURDATE(), INTERVAL -80 DAY), DATE_ADD(CURDATE(), INTERVAL 8 DAY), 59.00, 'USD', '{"validityCase":"valid_future","source":"seed"}'),
  ('seed_sub_003', 'seed_member_003', 'seed_plan_basic', 'Basic Monthly', 'expired', DATE_ADD(CURDATE(), INTERVAL -130 DAY), DATE_ADD(CURDATE(), INTERVAL -2 DAY), 39.00, 'USD', '{"validityCase":"expired","source":"seed"}'),
  ('seed_sub_004', 'seed_member_004', 'seed_plan_premium', 'Premium Monthly', 'suspended', DATE_ADD(CURDATE(), INTERVAL -40 DAY), DATE_ADD(CURDATE(), INTERVAL 18 DAY), 89.00, 'USD', '{"validityCase":"suspended_valid","source":"seed"}'),
  ('seed_sub_005', 'seed_member_005', 'seed_plan_trial', '7 Day Trial', 'active', DATE_ADD(CURDATE(), INTERVAL -3 DAY), DATE_ADD(CURDATE(), INTERVAL 4 DAY), 0.00, 'USD', '{"validityCase":"trial_valid","source":"seed"}'),
  ('seed_sub_006', 'seed_member_006', 'seed_plan_quarterly', 'Quarterly Fitness', 'paused', DATE_ADD(CURDATE(), INTERVAL -45 DAY), DATE_ADD(CURDATE(), INTERVAL 45 DAY), 229.00, 'USD', '{"validityCase":"paused_valid","source":"seed"}'),
  ('seed_sub_007', 'seed_member_007', 'seed_plan_annual', 'Annual Elite', 'active', DATE_ADD(CURDATE(), INTERVAL -220 DAY), DATE_ADD(CURDATE(), INTERVAL 210 DAY), 799.00, 'USD', '{"validityCase":"valid_long","source":"seed"}'),
  ('seed_sub_008', 'seed_member_008', 'seed_plan_basic', 'Basic Monthly', 'expired', DATE_ADD(CURDATE(), INTERVAL -200 DAY), DATE_ADD(CURDATE(), INTERVAL -60 DAY), 39.00, 'USD', '{"validityCase":"inactive_expired","source":"seed"}'),
  ('seed_sub_009', 'seed_member_009', 'seed_plan_standard', 'Standard Monthly', 'active', DATE_ADD(CURDATE(), INTERVAL -60 DAY), DATE_ADD(CURDATE(), INTERVAL 2 DAY), 59.00, 'USD', '{"validityCase":"renewal_soon","source":"seed"}'),
  ('seed_sub_010', 'seed_member_010', 'seed_plan_archived', 'Legacy Corporate', 'cancelled', DATE_ADD(CURDATE(), INTERVAL -500 DAY), DATE_ADD(CURDATE(), INTERVAL -300 DAY), 499.00, 'USD', '{"validityCase":"archived","source":"seed"}'),
  ('seed_sub_011', 'seed_member_011', 'seed_plan_premium', 'Premium Monthly', 'active', DATE_ADD(CURDATE(), INTERVAL -20 DAY), DATE_ADD(CURDATE(), INTERVAL 25 DAY), 89.00, 'USD', '{"validityCase":"valid_future","source":"seed"}'),
  ('seed_sub_012', 'seed_member_012', 'seed_plan_standard', 'Standard Monthly', 'expired', DATE_ADD(CURDATE(), INTERVAL -90 DAY), DATE_ADD(CURDATE(), INTERVAL -1 DAY), 59.00, 'USD', '{"validityCase":"expired","source":"seed"}'),
  ('seed_sub_013', 'seed_member_013', 'seed_plan_basic', 'Basic Monthly', 'active', DATE_ADD(CURDATE(), INTERVAL -15 DAY), DATE_ADD(CURDATE(), INTERVAL 15 DAY), 39.00, 'USD', '{"validityCase":"valid_future","source":"seed"}'),
  ('seed_sub_014', 'seed_member_014', 'seed_plan_quarterly', 'Quarterly Fitness', 'active', DATE_ADD(CURDATE(), INTERVAL -75 DAY), DATE_ADD(CURDATE(), INTERVAL 55 DAY), 229.00, 'USD', '{"validityCase":"valid_future","source":"seed"}'),
  ('seed_sub_015', 'seed_member_015', 'seed_plan_basic', 'Basic Monthly', 'expired', DATE_ADD(CURDATE(), INTERVAL -70 DAY), DATE_ADD(CURDATE(), INTERVAL -10 DAY), 39.00, 'USD', '{"validityCase":"suspended_expired","source":"seed"}'),
  ('seed_sub_016', 'seed_member_016', 'seed_plan_trial', '7 Day Trial', 'active', DATE_ADD(CURDATE(), INTERVAL -7 DAY), DATE_ADD(CURDATE(), INTERVAL 0 DAY), 0.00, 'USD', '{"validityCase":"trial_expiring_today","source":"seed"}'),
  ('seed_sub_017', 'seed_member_017', 'seed_plan_annual', 'Annual Elite', 'active', DATE_ADD(CURDATE(), INTERVAL -30 DAY), DATE_ADD(CURDATE(), INTERVAL 330 DAY), 799.00, 'USD', '{"validityCase":"valid_long","source":"seed"}'),
  ('seed_sub_018', 'seed_member_018', 'seed_plan_premium', 'Premium Monthly', 'paused', DATE_ADD(CURDATE(), INTERVAL -10 DAY), DATE_ADD(CURDATE(), INTERVAL 12 DAY), 89.00, 'USD', '{"validityCase":"paused_future","source":"seed"}'),
  ('seed_sub_019', 'seed_member_019', 'seed_plan_standard', 'Standard Monthly', 'active', DATE_ADD(CURDATE(), INTERVAL -1 DAY), DATE_ADD(CURDATE(), INTERVAL 29 DAY), 59.00, 'USD', '{"validityCase":"new_member","source":"seed"}'),
  ('seed_sub_020', 'seed_member_020', 'seed_plan_basic', 'Basic Monthly', 'cancelled', DATE_ADD(CURDATE(), INTERVAL -300 DAY), DATE_ADD(CURDATE(), INTERVAL -120 DAY), 39.00, 'USD', '{"validityCase":"no_active_subscription","source":"seed"}')
ON DUPLICATE KEY UPDATE member_id = VALUES(member_id), plan_id = VALUES(plan_id), plan_name = VALUES(plan_name), status = VALUES(status), start_date = VALUES(start_date), end_date = VALUES(end_date), price = VALUES(price), currency = VALUES(currency), data = VALUES(data);

INSERT INTO subscriptions (id, member_id, plan_id, start_date, end_date, status, amount, data) VALUES
  ('seed_sub_001', 'seed_member_001', 'seed_plan_premium', DATE_ADD(CURDATE(), INTERVAL -120 DAY), DATE_ADD(CURDATE(), INTERVAL 20 DAY), 'active', 89.00, '{"planName":"Premium Monthly","source":"seed"}'),
  ('seed_sub_002', 'seed_member_002', 'seed_plan_standard', DATE_ADD(CURDATE(), INTERVAL -80 DAY), DATE_ADD(CURDATE(), INTERVAL 8 DAY), 'active', 59.00, '{"planName":"Standard Monthly","source":"seed"}'),
  ('seed_sub_003', 'seed_member_003', 'seed_plan_basic', DATE_ADD(CURDATE(), INTERVAL -130 DAY), DATE_ADD(CURDATE(), INTERVAL -2 DAY), 'expired', 39.00, '{"planName":"Basic Monthly","source":"seed"}'),
  ('seed_sub_004', 'seed_member_004', 'seed_plan_premium', DATE_ADD(CURDATE(), INTERVAL -40 DAY), DATE_ADD(CURDATE(), INTERVAL 18 DAY), 'suspended', 89.00, '{"planName":"Premium Monthly","source":"seed"}'),
  ('seed_sub_005', 'seed_member_005', 'seed_plan_trial', DATE_ADD(CURDATE(), INTERVAL -3 DAY), DATE_ADD(CURDATE(), INTERVAL 4 DAY), 'active', 0.00, '{"planName":"7 Day Trial","source":"seed"}'),
  ('seed_sub_006', 'seed_member_006', 'seed_plan_quarterly', DATE_ADD(CURDATE(), INTERVAL -45 DAY), DATE_ADD(CURDATE(), INTERVAL 45 DAY), 'paused', 229.00, '{"planName":"Quarterly Fitness","source":"seed"}'),
  ('seed_sub_007', 'seed_member_007', 'seed_plan_annual', DATE_ADD(CURDATE(), INTERVAL -220 DAY), DATE_ADD(CURDATE(), INTERVAL 210 DAY), 'active', 799.00, '{"planName":"Annual Elite","source":"seed"}'),
  ('seed_sub_008', 'seed_member_008', 'seed_plan_basic', DATE_ADD(CURDATE(), INTERVAL -200 DAY), DATE_ADD(CURDATE(), INTERVAL -60 DAY), 'expired', 39.00, '{"planName":"Basic Monthly","source":"seed"}'),
  ('seed_sub_009', 'seed_member_009', 'seed_plan_standard', DATE_ADD(CURDATE(), INTERVAL -60 DAY), DATE_ADD(CURDATE(), INTERVAL 2 DAY), 'active', 59.00, '{"planName":"Standard Monthly","source":"seed"}'),
  ('seed_sub_010', 'seed_member_010', 'seed_plan_archived', DATE_ADD(CURDATE(), INTERVAL -500 DAY), DATE_ADD(CURDATE(), INTERVAL -300 DAY), 'cancelled', 499.00, '{"planName":"Legacy Corporate","source":"seed"}'),
  ('seed_sub_011', 'seed_member_011', 'seed_plan_premium', DATE_ADD(CURDATE(), INTERVAL -20 DAY), DATE_ADD(CURDATE(), INTERVAL 25 DAY), 'active', 89.00, '{"planName":"Premium Monthly","source":"seed"}'),
  ('seed_sub_012', 'seed_member_012', 'seed_plan_standard', DATE_ADD(CURDATE(), INTERVAL -90 DAY), DATE_ADD(CURDATE(), INTERVAL -1 DAY), 'expired', 59.00, '{"planName":"Standard Monthly","source":"seed"}'),
  ('seed_sub_013', 'seed_member_013', 'seed_plan_basic', DATE_ADD(CURDATE(), INTERVAL -15 DAY), DATE_ADD(CURDATE(), INTERVAL 15 DAY), 'active', 39.00, '{"planName":"Basic Monthly","source":"seed"}'),
  ('seed_sub_014', 'seed_member_014', 'seed_plan_quarterly', DATE_ADD(CURDATE(), INTERVAL -75 DAY), DATE_ADD(CURDATE(), INTERVAL 55 DAY), 'active', 229.00, '{"planName":"Quarterly Fitness","source":"seed"}'),
  ('seed_sub_015', 'seed_member_015', 'seed_plan_basic', DATE_ADD(CURDATE(), INTERVAL -70 DAY), DATE_ADD(CURDATE(), INTERVAL -10 DAY), 'expired', 39.00, '{"planName":"Basic Monthly","source":"seed"}'),
  ('seed_sub_016', 'seed_member_016', 'seed_plan_trial', DATE_ADD(CURDATE(), INTERVAL -7 DAY), DATE_ADD(CURDATE(), INTERVAL 0 DAY), 'active', 0.00, '{"planName":"7 Day Trial","source":"seed"}'),
  ('seed_sub_017', 'seed_member_017', 'seed_plan_annual', DATE_ADD(CURDATE(), INTERVAL -30 DAY), DATE_ADD(CURDATE(), INTERVAL 330 DAY), 'active', 799.00, '{"planName":"Annual Elite","source":"seed"}'),
  ('seed_sub_018', 'seed_member_018', 'seed_plan_premium', DATE_ADD(CURDATE(), INTERVAL -10 DAY), DATE_ADD(CURDATE(), INTERVAL 12 DAY), 'paused', 89.00, '{"planName":"Premium Monthly","source":"seed"}'),
  ('seed_sub_019', 'seed_member_019', 'seed_plan_standard', DATE_ADD(CURDATE(), INTERVAL -1 DAY), DATE_ADD(CURDATE(), INTERVAL 29 DAY), 'active', 59.00, '{"planName":"Standard Monthly","source":"seed"}'),
  ('seed_sub_020', 'seed_member_020', 'seed_plan_basic', DATE_ADD(CURDATE(), INTERVAL -300 DAY), DATE_ADD(CURDATE(), INTERVAL -120 DAY), 'cancelled', 39.00, '{"planName":"Basic Monthly","source":"seed"}')
ON DUPLICATE KEY UPDATE member_id = VALUES(member_id), plan_id = VALUES(plan_id), start_date = VALUES(start_date), end_date = VALUES(end_date), status = VALUES(status), amount = VALUES(amount), data = VALUES(data);

INSERT INTO invoices (id, invoice_number, member_id, subscription_id, status, subtotal, tax_amount, total, currency, due_date, paid_at, data) VALUES
  ('seed_inv_001', 'SEED-INV-0001', 'seed_member_001', 'seed_sub_001', 'paid', 89.00, 9.79, 98.79, 'USD', DATE_ADD(CURDATE(), INTERVAL 23 DAY), NOW(), '{"memberName":"Adam Saliba","planName":"Premium Monthly","source":"seed"}'),
  ('seed_inv_002', 'SEED-INV-0002', 'seed_member_002', 'seed_sub_002', 'paid', 59.00, 6.49, 65.49, 'USD', DATE_ADD(CURDATE(), INTERVAL 11 DAY), NOW(), '{"memberName":"Lina Karam","planName":"Standard Monthly","source":"seed"}'),
  ('seed_inv_003', 'SEED-INV-0003', 'seed_member_003', 'seed_sub_003', 'paid', 39.00, 4.29, 43.29, 'USD', DATE_ADD(CURDATE(), INTERVAL 3 DAY), NOW(), '{"memberName":"Joe Khoury","planName":"Basic Monthly","source":"seed"}'),
  ('seed_inv_004', 'SEED-INV-0004', 'seed_member_004', 'seed_sub_004', 'issued', 89.00, 9.79, 98.79, 'USD', DATE_ADD(CURDATE(), INTERVAL 21 DAY), NULL, '{"memberName":"Mira Ammar","planName":"Premium Monthly","source":"seed"}'),
  ('seed_inv_005', 'SEED-INV-0005', 'seed_member_005', 'seed_sub_005', 'paid', 0.00, 0.00, 0.00, 'USD', DATE_ADD(CURDATE(), INTERVAL 7 DAY), NOW(), '{"memberName":"Hadi Sfeir","planName":"7 Day Trial","source":"seed"}'),
  ('seed_inv_006', 'SEED-INV-0006', 'seed_member_006', 'seed_sub_006', 'paid', 229.00, 25.19, 254.19, 'USD', DATE_ADD(CURDATE(), INTERVAL 48 DAY), NOW(), '{"memberName":"Yara Nassar","planName":"Quarterly Fitness","source":"seed"}'),
  ('seed_inv_007', 'SEED-INV-0007', 'seed_member_007', 'seed_sub_007', 'paid', 799.00, 87.89, 886.89, 'USD', DATE_ADD(CURDATE(), INTERVAL 213 DAY), NOW(), '{"memberName":"Samir Fakhry","planName":"Annual Elite","source":"seed"}'),
  ('seed_inv_008', 'SEED-INV-0008', 'seed_member_008', 'seed_sub_008', 'issued', 39.00, 4.29, 43.29, 'USD', DATE_ADD(CURDATE(), INTERVAL 3 DAY), NULL, '{"memberName":"Nour Azar","planName":"Basic Monthly","source":"seed"}'),
  ('seed_inv_009', 'SEED-INV-0009', 'seed_member_009', 'seed_sub_009', 'paid', 59.00, 6.49, 65.49, 'USD', DATE_ADD(CURDATE(), INTERVAL 5 DAY), NOW(), '{"memberName":"Rami Abi Raad","planName":"Standard Monthly","source":"seed"}'),
  ('seed_inv_010', 'SEED-INV-0010', 'seed_member_010', 'seed_sub_010', 'paid', 499.00, 54.89, 553.89, 'USD', DATE_ADD(CURDATE(), INTERVAL 3 DAY), NOW(), '{"memberName":"Dina Mouawad","planName":"Legacy Corporate","source":"seed"}'),
  ('seed_inv_011', 'SEED-INV-0011', 'seed_member_011', 'seed_sub_011', 'paid', 89.00, 9.79, 98.79, 'USD', DATE_ADD(CURDATE(), INTERVAL 28 DAY), NOW(), '{"memberName":"Fadi Gerges","planName":"Premium Monthly","source":"seed"}'),
  ('seed_inv_012', 'SEED-INV-0012', 'seed_member_012', 'seed_sub_012', 'issued', 59.00, 6.49, 65.49, 'USD', DATE_ADD(CURDATE(), INTERVAL 3 DAY), NULL, '{"memberName":"Celine Bitar","planName":"Standard Monthly","source":"seed"}'),
  ('seed_inv_013', 'SEED-INV-0013', 'seed_member_013', 'seed_sub_013', 'paid', 39.00, 4.29, 43.29, 'USD', DATE_ADD(CURDATE(), INTERVAL 18 DAY), NOW(), '{"memberName":"Walid Hanna","planName":"Basic Monthly","source":"seed"}'),
  ('seed_inv_014', 'SEED-INV-0014', 'seed_member_014', 'seed_sub_014', 'paid', 229.00, 25.19, 254.19, 'USD', DATE_ADD(CURDATE(), INTERVAL 58 DAY), NOW(), '{"memberName":"Rita Chahine","planName":"Quarterly Fitness","source":"seed"}'),
  ('seed_inv_015', 'SEED-INV-0015', 'seed_member_015', 'seed_sub_015', 'paid', 39.00, 4.29, 43.29, 'USD', DATE_ADD(CURDATE(), INTERVAL 3 DAY), NOW(), '{"memberName":"Ziad Matar","planName":"Basic Monthly","source":"seed"}'),
  ('seed_inv_016', 'SEED-INV-0016', 'seed_member_016', 'seed_sub_016', 'issued', 0.00, 0.00, 0.00, 'USD', DATE_ADD(CURDATE(), INTERVAL 3 DAY), NULL, '{"memberName":"Mona Issa","planName":"7 Day Trial","source":"seed"}'),
  ('seed_inv_017', 'SEED-INV-0017', 'seed_member_017', 'seed_sub_017', 'paid', 799.00, 87.89, 886.89, 'USD', DATE_ADD(CURDATE(), INTERVAL 333 DAY), NOW(), '{"memberName":"Elias Tannous","planName":"Annual Elite","source":"seed"}'),
  ('seed_inv_018', 'SEED-INV-0018', 'seed_member_018', 'seed_sub_018', 'paid', 89.00, 9.79, 98.79, 'USD', DATE_ADD(CURDATE(), INTERVAL 15 DAY), NOW(), '{"memberName":"Hiba Zeidan","planName":"Premium Monthly","source":"seed"}'),
  ('seed_inv_019', 'SEED-INV-0019', 'seed_member_019', 'seed_sub_019', 'paid', 59.00, 6.49, 65.49, 'USD', DATE_ADD(CURDATE(), INTERVAL 32 DAY), NOW(), '{"memberName":"Marwan Sarkis","planName":"Standard Monthly","source":"seed"}'),
  ('seed_inv_020', 'SEED-INV-0020', 'seed_member_020', 'seed_sub_020', 'issued', 39.00, 4.29, 43.29, 'USD', DATE_ADD(CURDATE(), INTERVAL 3 DAY), NULL, '{"memberName":"Layal Farah","planName":"Basic Monthly","source":"seed"}')
ON DUPLICATE KEY UPDATE invoice_number = VALUES(invoice_number), member_id = VALUES(member_id), subscription_id = VALUES(subscription_id), status = VALUES(status), subtotal = VALUES(subtotal), tax_amount = VALUES(tax_amount), total = VALUES(total), currency = VALUES(currency), due_date = VALUES(due_date), paid_at = VALUES(paid_at), data = VALUES(data);

INSERT INTO access_tokens (id, member_id, token_hash, status, expires_at, revoked_at, data) VALUES
  ('seed_token_001', 'seed_member_001', SHA2('seed-token-001', 256), 'active', DATE_ADD(CURDATE(), INTERVAL 20 DAY), NULL, '{"rawTokenForTesting":"seed-token-001","source":"seed"}'),
  ('seed_token_002', 'seed_member_002', SHA2('seed-token-002', 256), 'active', DATE_ADD(CURDATE(), INTERVAL 8 DAY), NULL, '{"rawTokenForTesting":"seed-token-002","source":"seed"}'),
  ('seed_token_003', 'seed_member_003', SHA2('seed-token-003', 256), 'expired', DATE_ADD(CURDATE(), INTERVAL -1 DAY), NULL, '{"rawTokenForTesting":"seed-token-003","source":"seed"}'),
  ('seed_token_004', 'seed_member_004', SHA2('seed-token-004', 256), 'revoked', DATE_ADD(CURDATE(), INTERVAL 18 DAY), NOW(), '{"rawTokenForTesting":"seed-token-004","source":"seed"}'),
  ('seed_token_005', 'seed_member_005', SHA2('seed-token-005', 256), 'active', DATE_ADD(CURDATE(), INTERVAL 4 DAY), NULL, '{"rawTokenForTesting":"seed-token-005","source":"seed"}'),
  ('seed_token_006', 'seed_member_006', SHA2('seed-token-006', 256), 'expired', DATE_ADD(CURDATE(), INTERVAL 45 DAY), NULL, '{"rawTokenForTesting":"seed-token-006","source":"seed"}'),
  ('seed_token_007', 'seed_member_007', SHA2('seed-token-007', 256), 'active', DATE_ADD(CURDATE(), INTERVAL 210 DAY), NULL, '{"rawTokenForTesting":"seed-token-007","source":"seed"}'),
  ('seed_token_008', 'seed_member_008', SHA2('seed-token-008', 256), 'expired', DATE_ADD(CURDATE(), INTERVAL -1 DAY), NULL, '{"rawTokenForTesting":"seed-token-008","source":"seed"}'),
  ('seed_token_009', 'seed_member_009', SHA2('seed-token-009', 256), 'active', DATE_ADD(CURDATE(), INTERVAL 2 DAY), NULL, '{"rawTokenForTesting":"seed-token-009","source":"seed"}'),
  ('seed_token_010', 'seed_member_010', SHA2('seed-token-010', 256), 'revoked', DATE_ADD(CURDATE(), INTERVAL -1 DAY), NOW(), '{"rawTokenForTesting":"seed-token-010","source":"seed"}'),
  ('seed_token_011', 'seed_member_011', SHA2('seed-token-011', 256), 'active', DATE_ADD(CURDATE(), INTERVAL 25 DAY), NULL, '{"rawTokenForTesting":"seed-token-011","source":"seed"}'),
  ('seed_token_012', 'seed_member_012', SHA2('seed-token-012', 256), 'expired', DATE_ADD(CURDATE(), INTERVAL -1 DAY), NULL, '{"rawTokenForTesting":"seed-token-012","source":"seed"}'),
  ('seed_token_013', 'seed_member_013', SHA2('seed-token-013', 256), 'active', DATE_ADD(CURDATE(), INTERVAL 15 DAY), NULL, '{"rawTokenForTesting":"seed-token-013","source":"seed"}'),
  ('seed_token_014', 'seed_member_014', SHA2('seed-token-014', 256), 'active', DATE_ADD(CURDATE(), INTERVAL 55 DAY), NULL, '{"rawTokenForTesting":"seed-token-014","source":"seed"}'),
  ('seed_token_015', 'seed_member_015', SHA2('seed-token-015', 256), 'revoked', DATE_ADD(CURDATE(), INTERVAL -1 DAY), NOW(), '{"rawTokenForTesting":"seed-token-015","source":"seed"}'),
  ('seed_token_016', 'seed_member_016', SHA2('seed-token-016', 256), 'active', DATE_ADD(CURDATE(), INTERVAL -1 DAY), NULL, '{"rawTokenForTesting":"seed-token-016","source":"seed"}'),
  ('seed_token_017', 'seed_member_017', SHA2('seed-token-017', 256), 'active', DATE_ADD(CURDATE(), INTERVAL 330 DAY), NULL, '{"rawTokenForTesting":"seed-token-017","source":"seed"}'),
  ('seed_token_018', 'seed_member_018', SHA2('seed-token-018', 256), 'expired', DATE_ADD(CURDATE(), INTERVAL 12 DAY), NULL, '{"rawTokenForTesting":"seed-token-018","source":"seed"}'),
  ('seed_token_019', 'seed_member_019', SHA2('seed-token-019', 256), 'active', DATE_ADD(CURDATE(), INTERVAL 29 DAY), NULL, '{"rawTokenForTesting":"seed-token-019","source":"seed"}'),
  ('seed_token_020', 'seed_member_020', SHA2('seed-token-020', 256), 'expired', DATE_ADD(CURDATE(), INTERVAL -1 DAY), NULL, '{"rawTokenForTesting":"seed-token-020","source":"seed"}')
ON DUPLICATE KEY UPDATE member_id = VALUES(member_id), token_hash = VALUES(token_hash), status = VALUES(status), expires_at = VALUES(expires_at), revoked_at = VALUES(revoked_at), data = VALUES(data);

INSERT INTO class_sessions (id, title, trainer_id, trainer_name, capacity, start_time, end_time, room, status, class_type, level, branch, data) VALUES
  ('seed_class_001', 'Morning HIIT', 'seed_staff_trainer', 'Omar Nasser', 12, CONCAT(DATE_ADD(CURDATE(), INTERVAL 1 DAY), ' 08:00:00'), CONCAT(DATE_ADD(CURDATE(), INTERVAL 1 DAY), ' 08:45:00'), 'Main Studio', 'scheduled', 'HIIT', 'Intermediate', 'Main Branch', '{"source":"seed","roomReserved":"Main Studio","trainerReserved":"seed_staff_trainer"}'),
  ('seed_class_002', 'Strength Fundamentals', 'seed_staff_trainer', 'Omar Nasser', 10, CONCAT(DATE_ADD(CURDATE(), INTERVAL 1 DAY), ' 10:00:00'), CONCAT(DATE_ADD(CURDATE(), INTERVAL 1 DAY), ' 11:00:00'), 'Strength Room', 'scheduled', 'Strength', 'Beginner', 'Main Branch', '{"source":"seed","roomReserved":"Strength Room","trainerReserved":"seed_staff_trainer"}'),
  ('seed_class_003', 'Yoga Flow', 'seed_staff_manager', 'Rana Khalil', 14, CONCAT(DATE_ADD(CURDATE(), INTERVAL 2 DAY), ' 18:00:00'), CONCAT(DATE_ADD(CURDATE(), INTERVAL 2 DAY), ' 19:00:00'), 'Yoga Room', 'scheduled', 'Yoga', 'All Levels', 'Main Branch', '{"source":"seed","roomReserved":"Yoga Room","trainerReserved":"seed_staff_manager"}'),
  ('seed_class_004', 'Spin Power', 'seed_staff_trainer', 'Omar Nasser', 8, CONCAT(DATE_ADD(CURDATE(), INTERVAL 3 DAY), ' 07:30:00'), CONCAT(DATE_ADD(CURDATE(), INTERVAL 3 DAY), ' 08:15:00'), 'Cycling Room', 'scheduled', 'Cycling', 'Advanced', 'Main Branch', '{"source":"seed","roomReserved":"Cycling Room","trainerReserved":"seed_staff_trainer"}'),
  ('seed_class_005', 'Box Exterior Circuit', 'seed_staff_manager', 'Rana Khalil', 16, CONCAT(DATE_ADD(CURDATE(), INTERVAL 3 DAY), ' 19:00:00'), CONCAT(DATE_ADD(CURDATE(), INTERVAL 3 DAY), ' 20:00:00'), 'Box Exterior', 'scheduled', 'Circuit', 'Intermediate', 'Outdoor', '{"source":"seed","roomReserved":"Box Exterior","trainerReserved":"seed_staff_manager"}'),
  ('seed_class_006', 'Lunch Core', 'seed_staff_trainer', 'Omar Nasser', 10, CONCAT(DATE_ADD(CURDATE(), INTERVAL 4 DAY), ' 12:30:00'), CONCAT(DATE_ADD(CURDATE(), INTERVAL 4 DAY), ' 13:15:00'), 'Sala A', 'scheduled', 'Core', 'All Levels', 'Main Branch', '{"source":"seed","roomReserved":"Sala A","trainerReserved":"seed_staff_trainer"}'),
  ('seed_class_007', 'Evening Mobility', 'seed_staff_hr', 'Tarek Aoun', 12, CONCAT(DATE_ADD(CURDATE(), INTERVAL 4 DAY), ' 18:30:00'), CONCAT(DATE_ADD(CURDATE(), INTERVAL 4 DAY), ' 19:15:00'), 'Sala B', 'scheduled', 'Mobility', 'Beginner', 'Main Branch', '{"source":"seed","roomReserved":"Sala B","trainerReserved":"seed_staff_hr"}'),
  ('seed_class_008', 'Weekend Bootcamp', 'seed_staff_manager', 'Rana Khalil', 20, CONCAT(DATE_ADD(CURDATE(), INTERVAL 6 DAY), ' 09:00:00'), CONCAT(DATE_ADD(CURDATE(), INTERVAL 6 DAY), ' 10:15:00'), 'Box Exterior', 'scheduled', 'Bootcamp', 'Advanced', 'Outdoor', '{"source":"seed","roomReserved":"Box Exterior","trainerReserved":"seed_staff_manager"}'),
  ('seed_class_009', 'Cancelled Pilates', 'seed_staff_trainer', 'Omar Nasser', 12, CONCAT(DATE_ADD(CURDATE(), INTERVAL 5 DAY), ' 17:00:00'), CONCAT(DATE_ADD(CURDATE(), INTERVAL 5 DAY), ' 18:00:00'), 'Yoga Room', 'cancelled', 'Pilates', 'All Levels', 'Main Branch', '{"source":"seed","roomReserved":"Yoga Room","trainerReserved":"seed_staff_trainer"}'),
  ('seed_class_010', 'Full Test Class', 'seed_staff_trainer', 'Omar Nasser', 4, CONCAT(DATE_ADD(CURDATE(), INTERVAL 2 DAY), ' 20:00:00'), CONCAT(DATE_ADD(CURDATE(), INTERVAL 2 DAY), ' 20:45:00'), 'Main Studio', 'scheduled', 'Test', 'All Levels', 'Main Branch', '{"source":"seed","roomReserved":"Main Studio","trainerReserved":"seed_staff_trainer"}')
ON DUPLICATE KEY UPDATE title = VALUES(title), trainer_id = VALUES(trainer_id), trainer_name = VALUES(trainer_name), capacity = VALUES(capacity), start_time = VALUES(start_time), end_time = VALUES(end_time), room = VALUES(room), status = VALUES(status), class_type = VALUES(class_type), level = VALUES(level), branch = VALUES(branch), data = VALUES(data);

INSERT INTO classes (id, name, instructor_id, start_time, end_time, capacity, data) VALUES
  ('seed_class_001', 'Morning HIIT', 'seed_staff_trainer', CONCAT(DATE_ADD(CURDATE(), INTERVAL 1 DAY), ' 08:00:00'), CONCAT(DATE_ADD(CURDATE(), INTERVAL 1 DAY), ' 08:45:00'), 12, '{"title":"Morning HIIT","trainerName":"Omar Nasser","room":"Main Studio","status":"scheduled","classType":"HIIT","level":"Intermediate","branch":"Main Branch","source":"seed"}'),
  ('seed_class_002', 'Strength Fundamentals', 'seed_staff_trainer', CONCAT(DATE_ADD(CURDATE(), INTERVAL 1 DAY), ' 10:00:00'), CONCAT(DATE_ADD(CURDATE(), INTERVAL 1 DAY), ' 11:00:00'), 10, '{"title":"Strength Fundamentals","trainerName":"Omar Nasser","room":"Strength Room","status":"scheduled","classType":"Strength","level":"Beginner","branch":"Main Branch","source":"seed"}'),
  ('seed_class_003', 'Yoga Flow', 'seed_staff_manager', CONCAT(DATE_ADD(CURDATE(), INTERVAL 2 DAY), ' 18:00:00'), CONCAT(DATE_ADD(CURDATE(), INTERVAL 2 DAY), ' 19:00:00'), 14, '{"title":"Yoga Flow","trainerName":"Rana Khalil","room":"Yoga Room","status":"scheduled","classType":"Yoga","level":"All Levels","branch":"Main Branch","source":"seed"}'),
  ('seed_class_004', 'Spin Power', 'seed_staff_trainer', CONCAT(DATE_ADD(CURDATE(), INTERVAL 3 DAY), ' 07:30:00'), CONCAT(DATE_ADD(CURDATE(), INTERVAL 3 DAY), ' 08:15:00'), 8, '{"title":"Spin Power","trainerName":"Omar Nasser","room":"Cycling Room","status":"scheduled","classType":"Cycling","level":"Advanced","branch":"Main Branch","source":"seed"}'),
  ('seed_class_005', 'Box Exterior Circuit', 'seed_staff_manager', CONCAT(DATE_ADD(CURDATE(), INTERVAL 3 DAY), ' 19:00:00'), CONCAT(DATE_ADD(CURDATE(), INTERVAL 3 DAY), ' 20:00:00'), 16, '{"title":"Box Exterior Circuit","trainerName":"Rana Khalil","room":"Box Exterior","status":"scheduled","classType":"Circuit","level":"Intermediate","branch":"Outdoor","source":"seed"}'),
  ('seed_class_006', 'Lunch Core', 'seed_staff_trainer', CONCAT(DATE_ADD(CURDATE(), INTERVAL 4 DAY), ' 12:30:00'), CONCAT(DATE_ADD(CURDATE(), INTERVAL 4 DAY), ' 13:15:00'), 10, '{"title":"Lunch Core","trainerName":"Omar Nasser","room":"Sala A","status":"scheduled","classType":"Core","level":"All Levels","branch":"Main Branch","source":"seed"}'),
  ('seed_class_007', 'Evening Mobility', 'seed_staff_hr', CONCAT(DATE_ADD(CURDATE(), INTERVAL 4 DAY), ' 18:30:00'), CONCAT(DATE_ADD(CURDATE(), INTERVAL 4 DAY), ' 19:15:00'), 12, '{"title":"Evening Mobility","trainerName":"Tarek Aoun","room":"Sala B","status":"scheduled","classType":"Mobility","level":"Beginner","branch":"Main Branch","source":"seed"}'),
  ('seed_class_008', 'Weekend Bootcamp', 'seed_staff_manager', CONCAT(DATE_ADD(CURDATE(), INTERVAL 6 DAY), ' 09:00:00'), CONCAT(DATE_ADD(CURDATE(), INTERVAL 6 DAY), ' 10:15:00'), 20, '{"title":"Weekend Bootcamp","trainerName":"Rana Khalil","room":"Box Exterior","status":"scheduled","classType":"Bootcamp","level":"Advanced","branch":"Outdoor","source":"seed"}'),
  ('seed_class_009', 'Cancelled Pilates', 'seed_staff_trainer', CONCAT(DATE_ADD(CURDATE(), INTERVAL 5 DAY), ' 17:00:00'), CONCAT(DATE_ADD(CURDATE(), INTERVAL 5 DAY), ' 18:00:00'), 12, '{"title":"Cancelled Pilates","trainerName":"Omar Nasser","room":"Yoga Room","status":"cancelled","classType":"Pilates","level":"All Levels","branch":"Main Branch","source":"seed"}'),
  ('seed_class_010', 'Full Test Class', 'seed_staff_trainer', CONCAT(DATE_ADD(CURDATE(), INTERVAL 2 DAY), ' 20:00:00'), CONCAT(DATE_ADD(CURDATE(), INTERVAL 2 DAY), ' 20:45:00'), 4, '{"title":"Full Test Class","trainerName":"Omar Nasser","room":"Main Studio","status":"scheduled","classType":"Test","level":"All Levels","branch":"Main Branch","source":"seed"}')
ON DUPLICATE KEY UPDATE name = VALUES(name), instructor_id = VALUES(instructor_id), start_time = VALUES(start_time), end_time = VALUES(end_time), capacity = VALUES(capacity), data = VALUES(data);

INSERT INTO class_bookings (id, class_id, member_id, member_name, status, booked_at, cancelled_at, data) VALUES
  ('seed_booking_001', 'seed_class_001', 'seed_member_001', 'Adam Saliba', 'booked', NOW(), NULL, '{"source":"seed"}'),
  ('seed_booking_002', 'seed_class_001', 'seed_member_002', 'Lina Karam', 'booked', NOW(), NULL, '{"source":"seed"}'),
  ('seed_booking_003', 'seed_class_001', 'seed_member_009', 'Rami Abi Raad', 'booked', NOW(), NULL, '{"source":"seed"}'),
  ('seed_booking_004', 'seed_class_002', 'seed_member_013', 'Walid Hanna', 'booked', NOW(), NULL, '{"source":"seed"}'),
  ('seed_booking_005', 'seed_class_002', 'seed_member_014', 'Rita Chahine', 'booked', NOW(), NULL, '{"source":"seed"}'),
  ('seed_booking_006', 'seed_class_003', 'seed_member_005', 'Hadi Sfeir', 'booked', NOW(), NULL, '{"source":"seed"}'),
  ('seed_booking_007', 'seed_class_003', 'seed_member_006', 'Yara Nassar', 'booked', NOW(), NULL, '{"source":"seed"}'),
  ('seed_booking_008', 'seed_class_004', 'seed_member_007', 'Samir Fakhry', 'booked', NOW(), NULL, '{"source":"seed"}'),
  ('seed_booking_009', 'seed_class_004', 'seed_member_011', 'Fadi Gerges', 'booked', NOW(), NULL, '{"source":"seed"}'),
  ('seed_booking_010', 'seed_class_005', 'seed_member_017', 'Elias Tannous', 'booked', NOW(), NULL, '{"source":"seed"}'),
  ('seed_booking_011', 'seed_class_006', 'seed_member_019', 'Marwan Sarkis', 'booked', NOW(), NULL, '{"source":"seed"}'),
  ('seed_booking_012', 'seed_class_007', 'seed_member_016', 'Mona Issa', 'booked', NOW(), NULL, '{"source":"seed"}'),
  ('seed_booking_013', 'seed_class_008', 'seed_member_018', 'Hiba Zeidan', 'booked', NOW(), NULL, '{"source":"seed"}'),
  ('seed_booking_014', 'seed_class_009', 'seed_member_001', 'Adam Saliba', 'cancelled', NOW(), NOW(), '{"source":"seed"}'),
  ('seed_booking_015', 'seed_class_010', 'seed_member_001', 'Adam Saliba', 'booked', NOW(), NULL, '{"source":"seed"}'),
  ('seed_booking_016', 'seed_class_010', 'seed_member_002', 'Lina Karam', 'booked', NOW(), NULL, '{"source":"seed"}'),
  ('seed_booking_017', 'seed_class_010', 'seed_member_005', 'Hadi Sfeir', 'booked', NOW(), NULL, '{"source":"seed"}'),
  ('seed_booking_018', 'seed_class_010', 'seed_member_007', 'Samir Fakhry', 'booked', NOW(), NULL, '{"source":"seed"}')
ON DUPLICATE KEY UPDATE class_id = VALUES(class_id), member_id = VALUES(member_id), member_name = VALUES(member_name), status = VALUES(status), booked_at = VALUES(booked_at), cancelled_at = VALUES(cancelled_at), data = VALUES(data);

INSERT INTO private_sessions (id, series_id, member_id, member_name, trainer_id, trainer_name, start_time, end_time, room, status, level, branch, notes, data) VALUES
  ('seed_private_001', 'seed_series_001', 'seed_member_001', 'Adam Saliba', 'seed_staff_trainer', 'Omar Nasser', CONCAT(DATE_ADD(CURDATE(), INTERVAL 1 DAY), ' 09:00:00'), CONCAT(DATE_ADD(CURDATE(), INTERVAL 1 DAY), ' 10:00:00'), 'Personal Training Area', 'scheduled', 'Advanced', 'Main Branch', 'Strength assessment', '{"source":"seed","roomReserved":"Personal Training Area","trainerReserved":"seed_staff_trainer"}'),
  ('seed_private_002', 'seed_series_001', 'seed_member_001', 'Adam Saliba', 'seed_staff_trainer', 'Omar Nasser', CONCAT(DATE_ADD(CURDATE(), INTERVAL 3 DAY), ' 09:00:00'), CONCAT(DATE_ADD(CURDATE(), INTERVAL 3 DAY), ' 10:00:00'), 'Personal Training Area', 'scheduled', 'Advanced', 'Main Branch', 'Follow-up session', '{"source":"seed","roomReserved":"Personal Training Area","trainerReserved":"seed_staff_trainer"}'),
  ('seed_private_003', 'seed_series_002', 'seed_member_014', 'Rita Chahine', 'seed_staff_manager', 'Rana Khalil', CONCAT(DATE_ADD(CURDATE(), INTERVAL 2 DAY), ' 16:00:00'), CONCAT(DATE_ADD(CURDATE(), INTERVAL 2 DAY), ' 17:00:00'), 'Sala A', 'scheduled', 'Intermediate', 'Main Branch', 'Mobility and posture', '{"source":"seed","roomReserved":"Sala A","trainerReserved":"seed_staff_manager"}'),
  ('seed_private_004', 'seed_series_003', 'seed_member_017', 'Elias Tannous', 'seed_staff_trainer', 'Omar Nasser', CONCAT(DATE_ADD(CURDATE(), INTERVAL 4 DAY), ' 07:00:00'), CONCAT(DATE_ADD(CURDATE(), INTERVAL 4 DAY), ' 08:00:00'), 'Strength Room', 'scheduled', 'Advanced', 'Main Branch', 'Powerlifting coaching', '{"source":"seed","roomReserved":"Strength Room","trainerReserved":"seed_staff_trainer"}'),
  ('seed_private_005', 'seed_series_004', 'seed_member_019', 'Marwan Sarkis', 'seed_staff_hr', 'Tarek Aoun', CONCAT(DATE_ADD(CURDATE(), INTERVAL 5 DAY), ' 11:00:00'), CONCAT(DATE_ADD(CURDATE(), INTERVAL 5 DAY), ' 12:00:00'), 'Sala B', 'scheduled', 'Beginner', 'Main Branch', 'Intro PT', '{"source":"seed","roomReserved":"Sala B","trainerReserved":"seed_staff_hr"}'),
  ('seed_private_006', 'seed_series_005', 'seed_member_006', 'Yara Nassar', 'seed_staff_manager', 'Rana Khalil', CONCAT(DATE_ADD(CURDATE(), INTERVAL 6 DAY), ' 14:00:00'), CONCAT(DATE_ADD(CURDATE(), INTERVAL 6 DAY), ' 15:00:00'), 'Yoga Room', 'cancelled', 'All Levels', 'Main Branch', 'Paused member check', '{"source":"seed","roomReserved":"Yoga Room","trainerReserved":"seed_staff_manager"}')
ON DUPLICATE KEY UPDATE series_id = VALUES(series_id), member_id = VALUES(member_id), member_name = VALUES(member_name), trainer_id = VALUES(trainer_id), trainer_name = VALUES(trainer_name), start_time = VALUES(start_time), end_time = VALUES(end_time), room = VALUES(room), status = VALUES(status), level = VALUES(level), branch = VALUES(branch), notes = VALUES(notes), data = VALUES(data);

INSERT INTO shifts (id, data) VALUES
  ('seed_shift_001', JSON_OBJECT('id','seed_shift_001','userId','seed_staff_reception','startTime',CONCAT(DATE_ADD(CURDATE(), INTERVAL 1 DAY),'T08:00:00.000Z'),'endTime',CONCAT(DATE_ADD(CURDATE(), INTERVAL 1 DAY),'T16:00:00.000Z'),'notes','Front desk morning','source','seed')),
  ('seed_shift_002', JSON_OBJECT('id','seed_shift_002','userId','seed_staff_reception','startTime',CONCAT(DATE_ADD(CURDATE(), INTERVAL 2 DAY),'T14:00:00.000Z'),'endTime',CONCAT(DATE_ADD(CURDATE(), INTERVAL 2 DAY),'T22:00:00.000Z'),'notes','Front desk evening','source','seed')),
  ('seed_shift_003', JSON_OBJECT('id','seed_shift_003','userId','seed_staff_trainer','startTime',CONCAT(DATE_ADD(CURDATE(), INTERVAL 1 DAY),'T07:00:00.000Z'),'endTime',CONCAT(DATE_ADD(CURDATE(), INTERVAL 1 DAY),'T15:00:00.000Z'),'notes','Training floor','source','seed')),
  ('seed_shift_004', JSON_OBJECT('id','seed_shift_004','userId','seed_staff_trainer','startTime',CONCAT(DATE_ADD(CURDATE(), INTERVAL 3 DAY),'T15:00:00.000Z'),'endTime',CONCAT(DATE_ADD(CURDATE(), INTERVAL 3 DAY),'T22:00:00.000Z'),'notes','Evening training','source','seed')),
  ('seed_shift_005', JSON_OBJECT('id','seed_shift_005','userId','seed_staff_accounting','startTime',CONCAT(DATE_ADD(CURDATE(), INTERVAL 1 DAY),'T09:00:00.000Z'),'endTime',CONCAT(DATE_ADD(CURDATE(), INTERVAL 1 DAY),'T17:00:00.000Z'),'notes','Finance office','source','seed')),
  ('seed_shift_006', JSON_OBJECT('id','seed_shift_006','userId','seed_staff_hr','startTime',CONCAT(DATE_ADD(CURDATE(), INTERVAL 2 DAY),'T09:00:00.000Z'),'endTime',CONCAT(DATE_ADD(CURDATE(), INTERVAL 2 DAY),'T17:00:00.000Z'),'notes','HR office','source','seed')),
  ('seed_shift_007', JSON_OBJECT('id','seed_shift_007','userId','seed_staff_support','startTime',CONCAT(DATE_ADD(CURDATE(), INTERVAL 4 DAY),'T10:00:00.000Z'),'endTime',CONCAT(DATE_ADD(CURDATE(), INTERVAL 4 DAY),'T18:00:00.000Z'),'notes','Support desk','source','seed')),
  ('seed_shift_008', JSON_OBJECT('id','seed_shift_008','userId','seed_staff_maintenance','startTime',CONCAT(DATE_ADD(CURDATE(), INTERVAL 5 DAY),'T06:00:00.000Z'),'endTime',CONCAT(DATE_ADD(CURDATE(), INTERVAL 5 DAY),'T14:00:00.000Z'),'notes','Facility checks','source','seed'))
ON DUPLICATE KEY UPDATE data = VALUES(data);

INSERT INTO employee_attendance (id, employee_id, employee_name, work_date, check_in, check_out, hours_worked, status, notes, data) VALUES
  ('seed_att_001', 'seed_staff_super_admin', 'Nadia Mansour', DATE_ADD(CURDATE(), INTERVAL -1 DAY), '09:00', '17:00', '8.00', 'present', 'Seed attendance record', '{"source":"seed"}'),
  ('seed_att_002', 'seed_staff_admin', 'Karim Haddad', DATE_ADD(CURDATE(), INTERVAL -2 DAY), '09:00', '17:00', '8.00', 'present', 'Seed attendance record', '{"source":"seed"}'),
  ('seed_att_003', 'seed_staff_manager', 'Rana Khalil', DATE_ADD(CURDATE(), INTERVAL -3 DAY), '09:00', '17:00', '8.00', 'late', 'Seed attendance record', '{"source":"seed"}'),
  ('seed_att_004', 'seed_staff_reception', 'Maya Saad', DATE_ADD(CURDATE(), INTERVAL -4 DAY), '09:00', '17:00', '8.00', 'present', 'Seed attendance record', '{"source":"seed"}'),
  ('seed_att_005', 'seed_staff_trainer', 'Omar Nasser', DATE_ADD(CURDATE(), INTERVAL -5 DAY), '09:00', '17:00', '8.00', 'absent', 'Seed attendance record', '{"source":"seed"}'),
  ('seed_att_006', 'seed_staff_accounting', 'Lea Fares', DATE_ADD(CURDATE(), INTERVAL -6 DAY), '09:00', '17:00', '8.00', 'present', 'Seed attendance record', '{"source":"seed"}'),
  ('seed_att_007', 'seed_staff_hr', 'Tarek Aoun', DATE_ADD(CURDATE(), INTERVAL -0 DAY), '09:00', '17:00', '8.00', 'unpaid_leave', 'Seed attendance record', '{"source":"seed"}'),
  ('seed_att_008', 'seed_staff_support', 'Sara Youssef', DATE_ADD(CURDATE(), INTERVAL -1 DAY), '09:00', '17:00', '8.00', 'present', 'Seed attendance record', '{"source":"seed"}'),
  ('seed_att_009', 'seed_staff_sales', 'George Abi', DATE_ADD(CURDATE(), INTERVAL -2 DAY), '09:00', '17:00', '8.00', 'present', 'Seed attendance record', '{"source":"seed"}'),
  ('seed_att_010', 'seed_staff_maintenance', 'Bilal Darwish', DATE_ADD(CURDATE(), INTERVAL -3 DAY), '09:00', '17:00', '8.00', 'present', 'Seed attendance record', '{"source":"seed"}')
ON DUPLICATE KEY UPDATE employee_id = VALUES(employee_id), employee_name = VALUES(employee_name), work_date = VALUES(work_date), check_in = VALUES(check_in), check_out = VALUES(check_out), hours_worked = VALUES(hours_worked), status = VALUES(status), notes = VALUES(notes), data = VALUES(data);

INSERT INTO payroll_runs (id, run_month, status, employee_count, total_base, total_allowances, total_bonuses, total_deductions, total_net_pay, created_by, approved_by, paid_at) VALUES
  ('seed_payroll_001', DATE_FORMAT(CURDATE(), '%Y-%m'), 'approved', 10, '29200.00', '4380.00', '750.00', '2044.00', '32286.00', 'seed_staff_hr', 'seed_staff_admin', NULL)
ON DUPLICATE KEY UPDATE run_month = VALUES(run_month), status = VALUES(status), employee_count = VALUES(employee_count), total_base = VALUES(total_base), total_allowances = VALUES(total_allowances), total_bonuses = VALUES(total_bonuses), total_deductions = VALUES(total_deductions), total_net_pay = VALUES(total_net_pay), created_by = VALUES(created_by), approved_by = VALUES(approved_by), paid_at = VALUES(paid_at);

INSERT INTO payroll_items (id, payroll_run_id, employee_id, employee_name, department, base_salary, allowances, bonus, deductions, attendance_deduction, net_pay, status, data) VALUES
  ('seed_payroll_item_001', 'seed_payroll_001', 'seed_staff_super_admin', 'Nadia Mansour', 'Management', 5200.00, 780.00, 50.00, 364.00, '0.00', 5666.00, 'approved', '{"role":"super_admin","source":"seed"}'),
  ('seed_payroll_item_002', 'seed_payroll_001', 'seed_staff_admin', 'Karim Haddad', 'Management', 4200.00, 630.00, 50.00, 294.00, '0.00', 4586.00, 'approved', '{"role":"admin","source":"seed"}'),
  ('seed_payroll_item_003', 'seed_payroll_001', 'seed_staff_manager', 'Rana Khalil', 'Operations', 3800.00, 570.00, 50.00, 266.00, '0.00', 4154.00, 'approved', '{"role":"manager","source":"seed"}'),
  ('seed_payroll_item_004', 'seed_payroll_001', 'seed_staff_reception', 'Maya Saad', 'Front Desk', 1600.00, 240.00, 50.00, 112.00, '0.00', 1778.00, 'approved', '{"role":"reception","source":"seed"}'),
  ('seed_payroll_item_005', 'seed_payroll_001', 'seed_staff_trainer', 'Omar Nasser', 'Training', 2600.00, 390.00, 100.00, 182.00, '0.00', 2908.00, 'approved', '{"role":"trainer","source":"seed"}'),
  ('seed_payroll_item_006', 'seed_payroll_001', 'seed_staff_accounting', 'Lea Fares', 'Finance', 2900.00, 435.00, 50.00, 203.00, '0.00', 3182.00, 'approved', '{"role":"accounting","source":"seed"}'),
  ('seed_payroll_item_007', 'seed_payroll_001', 'seed_staff_hr', 'Tarek Aoun', 'Human Resources', 2800.00, 420.00, 50.00, 196.00, '0.00', 3074.00, 'approved', '{"role":"hr","source":"seed"}'),
  ('seed_payroll_item_008', 'seed_payroll_001', 'seed_staff_support', 'Sara Youssef', 'Support', 1800.00, 270.00, 50.00, 126.00, '0.00', 1994.00, 'approved', '{"role":"support","source":"seed"}'),
  ('seed_payroll_item_009', 'seed_payroll_001', 'seed_staff_sales', 'George Abi', 'Sales', 2100.00, 315.00, 100.00, 147.00, '0.00', 2368.00, 'approved', '{"role":"sales","source":"seed"}'),
  ('seed_payroll_item_010', 'seed_payroll_001', 'seed_staff_maintenance', 'Bilal Darwish', 'Maintenance', 1500.00, 225.00, 50.00, 105.00, '0.00', 1670.00, 'approved', '{"role":"maintenance","source":"seed"}')
ON DUPLICATE KEY UPDATE payroll_run_id = VALUES(payroll_run_id), employee_id = VALUES(employee_id), employee_name = VALUES(employee_name), department = VALUES(department), base_salary = VALUES(base_salary), allowances = VALUES(allowances), bonus = VALUES(bonus), deductions = VALUES(deductions), attendance_deduction = VALUES(attendance_deduction), net_pay = VALUES(net_pay), status = VALUES(status), data = VALUES(data);

INSERT INTO finance_transactions (id, type, category, amount, transaction_date, source, reference_type, reference_id, description, status, created_by, approved_by, data) VALUES
  ('seed_fin_tx_001', 'income', 'Membership Sales', 1480.00, DATE_ADD(CURDATE(), INTERVAL -1 DAY), 'Front Desk', 'invoice', 'seed_inv_batch_001', 'Paid monthly memberships', 'posted', 'seed_staff_accounting', 'seed_staff_admin', '{"source":"seed"}'),
  ('seed_fin_tx_002', 'income', 'Private Training', 320.00, DATE_ADD(CURDATE(), INTERVAL -2 DAY), 'Trainer Desk', 'manual', 'seed_private_income_001', 'Private sessions package', 'posted', 'seed_staff_accounting', 'seed_staff_admin', '{"source":"seed"}'),
  ('seed_fin_tx_003', 'expense', 'Payroll', 32286.00, DATE_ADD(CURDATE(), INTERVAL 0 DAY), 'HR Payroll', 'payroll', 'seed_payroll_001', 'Approved payroll run', 'pending_approval', 'seed_staff_accounting', NULL, '{"source":"seed"}'),
  ('seed_fin_tx_004', 'expense', 'Rent', 4500.00, DATE_ADD(CURDATE(), INTERVAL -3 DAY), 'Facilities', 'manual', 'seed_rent_001', 'Monthly gym rent', 'posted', 'seed_staff_accounting', 'seed_staff_admin', '{"source":"seed"}'),
  ('seed_fin_tx_005', 'expense', 'Equipment Purchase', 1200.00, DATE_ADD(CURDATE(), INTERVAL -5 DAY), 'Procurement', 'manual', 'seed_purchase_001', 'Dumbbells and mats', 'posted', 'seed_staff_accounting', 'seed_staff_admin', '{"source":"seed"}'),
  ('seed_fin_tx_006', 'expense', 'Marketing', 650.00, DATE_ADD(CURDATE(), INTERVAL -7 DAY), 'Marketing', 'manual', 'seed_marketing_001', 'Social media campaign', 'posted', 'seed_staff_accounting', 'seed_staff_admin', '{"source":"seed"}'),
  ('seed_fin_tx_007', 'income', 'Corporate Plan', 799.00, DATE_ADD(CURDATE(), INTERVAL -10 DAY), 'Sales', 'invoice', 'seed_inv_017', 'Annual elite payment', 'posted', 'seed_staff_accounting', 'seed_staff_admin', '{"source":"seed"}')
ON DUPLICATE KEY UPDATE type = VALUES(type), category = VALUES(category), amount = VALUES(amount), transaction_date = VALUES(transaction_date), source = VALUES(source), reference_type = VALUES(reference_type), reference_id = VALUES(reference_id), description = VALUES(description), status = VALUES(status), created_by = VALUES(created_by), approved_by = VALUES(approved_by), data = VALUES(data);

INSERT INTO finance_loans (id, lender_name, principal_amount, interest_rate, monthly_payment, start_date, end_date, status, notes, data) VALUES
  ('seed_loan_001', 'Bank Demo Lebanon', '25000.00', '6.500', '780.00', DATE_ADD(CURDATE(), INTERVAL -180 DAY), DATE_ADD(CURDATE(), INTERVAL 540 DAY), 'active', 'Equipment financing', '{"source":"seed"}'),
  ('seed_loan_002', 'Owner Loan', '10000.00', '0.000', '500.00', DATE_ADD(CURDATE(), INTERVAL -90 DAY), DATE_ADD(CURDATE(), INTERVAL 270 DAY), 'active', 'Short-term working capital', '{"source":"seed"}')
ON DUPLICATE KEY UPDATE lender_name = VALUES(lender_name), principal_amount = VALUES(principal_amount), interest_rate = VALUES(interest_rate), monthly_payment = VALUES(monthly_payment), start_date = VALUES(start_date), end_date = VALUES(end_date), status = VALUES(status), notes = VALUES(notes), data = VALUES(data);

INSERT INTO finance_rentals (id, name, monthly_cost, due_day, start_date, end_date, landlord_info, status, notes, data) VALUES
  ('seed_rental_001', 'Main Branch Facility', '4500.00', '5', DATE_ADD(CURDATE(), INTERVAL -365 DAY), DATE_ADD(CURDATE(), INTERVAL 365 DAY), 'Landlord Demo LLC - landlord@example.test', 'active', 'Primary gym location', '{"source":"seed"}'),
  ('seed_rental_002', 'Outdoor Box Lease', '900.00', '10', DATE_ADD(CURDATE(), INTERVAL -120 DAY), DATE_ADD(CURDATE(), INTERVAL 240 DAY), 'Outdoor Space Owner', 'active', 'Outdoor training area', '{"source":"seed"}')
ON DUPLICATE KEY UPDATE name = VALUES(name), monthly_cost = VALUES(monthly_cost), due_day = VALUES(due_day), start_date = VALUES(start_date), end_date = VALUES(end_date), landlord_info = VALUES(landlord_info), status = VALUES(status), notes = VALUES(notes), data = VALUES(data);

INSERT INTO finance_budgets (id, category, budget_month, monthly_target) VALUES
  ('seed_budget_001', 'Payroll', DATE_FORMAT(CURDATE(), '%Y-%m'), 33000.00),
  ('seed_budget_002', 'Rent', DATE_FORMAT(CURDATE(), '%Y-%m'), 5400.00),
  ('seed_budget_003', 'Marketing', DATE_FORMAT(CURDATE(), '%Y-%m'), 1200.00),
  ('seed_budget_004', 'Equipment Purchase', DATE_FORMAT(CURDATE(), '%Y-%m'), 2000.00),
  ('seed_budget_005', 'Membership Sales', DATE_FORMAT(CURDATE(), '%Y-%m'), 6500.00),
  ('seed_budget_006', 'Private Training', DATE_FORMAT(CURDATE(), '%Y-%m'), 1500.00)
ON DUPLICATE KEY UPDATE category = VALUES(category), budget_month = VALUES(budget_month), monthly_target = VALUES(monthly_target);

INSERT INTO finance_recurring_entries (id, name, type, category, amount, day_of_month, source, description, last_processed_month, is_active, data) VALUES
  ('seed_recurring_001', 'Monthly Rent', 'expense', 'Rent', '4500.00', '5', 'Facilities', 'Main facility monthly rent', DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m'), '1', '{"source":"seed"}'),
  ('seed_recurring_002', 'Internet and POS', 'expense', 'Utilities', '220.00', '15', 'Operations', 'Connectivity and POS subscription', DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m'), '1', '{"source":"seed"}')
ON DUPLICATE KEY UPDATE name = VALUES(name), type = VALUES(type), category = VALUES(category), amount = VALUES(amount), day_of_month = VALUES(day_of_month), source = VALUES(source), description = VALUES(description), last_processed_month = VALUES(last_processed_month), is_active = VALUES(is_active), data = VALUES(data);

INSERT INTO support_tickets (id, ticket_number, requester_name, requester_email, requester_phone, inquiry_type, priority, subject, description, status, assigned_to, created_by, resolved_at, data) VALUES
  ('seed_ticket_001', 'SEED-1001', 'Adam Saliba', 'adam.saliba@example.test', '+961-71-200001', 'technical', 'normal', 'QR access not scanning', 'Member reported QR scanner issue at entrance', 'open', 'seed_staff_support', 'seed_staff_support', NULL, '{"source":"seed"}'),
  ('seed_ticket_002', 'SEED-1002', 'Lina Karam', 'lina.karam@example.test', '+961-71-200002', 'commercial', 'high', 'Upgrade membership plan', 'Member wants to upgrade to Premium', 'in_progress', 'seed_staff_sales', 'seed_staff_support', NULL, '{"source":"seed"}'),
  ('seed_ticket_003', 'SEED-1003', 'Rita Chahine', 'rita.chahine@example.test', '+961-71-200014', 'technical', 'low', 'Invoice copy request', 'Member requested a PDF invoice copy', 'resolved', 'seed_staff_accounting', 'seed_staff_support', NOW(), '{"source":"seed"}')
ON DUPLICATE KEY UPDATE ticket_number = VALUES(ticket_number), requester_name = VALUES(requester_name), requester_email = VALUES(requester_email), requester_phone = VALUES(requester_phone), inquiry_type = VALUES(inquiry_type), priority = VALUES(priority), subject = VALUES(subject), description = VALUES(description), status = VALUES(status), assigned_to = VALUES(assigned_to), created_by = VALUES(created_by), resolved_at = VALUES(resolved_at), data = VALUES(data);

INSERT INTO support_ticket_messages (id, ticket_id, author_email, author_role, message, visibility, data) VALUES
  ('seed_ticket_msg_001', 'seed_ticket_001', 'sara.support@powergym.test', 'support', 'We will verify the QR reader and member token status.', 'public', '{"source":"seed"}'),
  ('seed_ticket_msg_002', 'seed_ticket_002', 'george.sales@powergym.test', 'sales', 'Premium upgrade options were sent to the member.', 'public', '{"source":"seed"}'),
  ('seed_ticket_msg_003', 'seed_ticket_003', 'lea.accounting@powergym.test', 'accounting', 'Invoice copy sent and ticket resolved.', 'public', '{"source":"seed"}')
ON DUPLICATE KEY UPDATE ticket_id = VALUES(ticket_id), author_email = VALUES(author_email), author_role = VALUES(author_role), message = VALUES(message), visibility = VALUES(visibility), data = VALUES(data);

INSERT INTO notifications (id, user_id, role, title, body, type, channel, link_url, read_at, expires_at, data) VALUES
  ('seed_notification_001', 'seed_staff_admin', NULL, 'Daily operations ready', 'Seed data loaded: review classes, bookings, HR and finance.', 'info', 'in_app', '/dashboard', NULL, DATE_ADD(NOW(), INTERVAL 30 DAY), '{"source":"seed"}'),
  ('seed_notification_002', NULL, 'reception', 'Renewals due soon', '2 memberships are expiring soon and should be contacted.', 'warning', 'in_app', '/members', NULL, DATE_ADD(NOW(), INTERVAL 30 DAY), '{"source":"seed"}'),
  ('seed_notification_003', NULL, 'trainer', 'Today classes prepared', 'Group classes and private sessions are available in schedule.', 'info', 'in_app', '/classes', NULL, DATE_ADD(NOW(), INTERVAL 30 DAY), '{"source":"seed"}'),
  ('seed_notification_004', NULL, 'accounting', 'Payroll transaction pending', 'Payroll finance posting requires accounting approval.', 'warning', 'in_app', '/accounting', NULL, DATE_ADD(NOW(), INTERVAL 30 DAY), '{"source":"seed"}')
ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), role = VALUES(role), title = VALUES(title), body = VALUES(body), type = VALUES(type), channel = VALUES(channel), link_url = VALUES(link_url), read_at = VALUES(read_at), expires_at = VALUES(expires_at), data = VALUES(data);

INSERT INTO notification_preferences (user_id, in_app_enabled, email_enabled, whatsapp_enabled, class_reminders, billing_reminders, support_updates, data) VALUES
  ('seed_staff_super_admin', '1', '1', '0', '1', '1', '1', '{"source":"seed"}'),
  ('seed_staff_admin', '1', '1', '0', '1', '1', '1', '{"source":"seed"}'),
  ('seed_staff_manager', '1', '1', '0', '1', '1', '1', '{"source":"seed"}'),
  ('seed_staff_reception', '1', '1', '0', '1', '1', '1', '{"source":"seed"}'),
  ('seed_staff_trainer', '1', '1', '0', '1', '1', '1', '{"source":"seed"}'),
  ('seed_staff_accounting', '1', '1', '0', '1', '1', '1', '{"source":"seed"}')
ON DUPLICATE KEY UPDATE in_app_enabled = VALUES(in_app_enabled), email_enabled = VALUES(email_enabled), whatsapp_enabled = VALUES(whatsapp_enabled), class_reminders = VALUES(class_reminders), billing_reminders = VALUES(billing_reminders), support_updates = VALUES(support_updates), data = VALUES(data);

INSERT INTO deployment_checklist (id, item_key, label, category, status, details) VALUES
  ('seed_deploy_001', 'seed_env_configured', 'Environment variables configured', 'environment', 'done', 'Demo seed assumes local MySQL env is configured'),
  ('seed_deploy_002', 'seed_db_migrated', 'Database migrations applied', 'database', 'done', 'Run npm run db:migrate before this seed'),
  ('seed_deploy_003', 'seed_ssl_required', 'HTTPS configured before production', 'security', 'pending', 'Required for production deployment')
ON DUPLICATE KEY UPDATE item_key = VALUES(item_key), label = VALUES(label), category = VALUES(category), status = VALUES(status), details = VALUES(details);

INSERT INTO security_events (event_type, severity, actor_email, ip_address, details, metadata) VALUES
  ('seed_login_success', 'info', 'nadia.superadmin@powergym.test', '127.0.0.1', 'Seed login success sample', '{"source":"seed"}'),
  ('seed_permission_denied', 'warning', 'guest@powergym.test', '127.0.0.1', 'Seed denied access sample', '{"source":"seed"}')
ON DUPLICATE KEY UPDATE event_type = VALUES(event_type), severity = VALUES(severity), actor_email = VALUES(actor_email), ip_address = VALUES(ip_address), details = VALUES(details), metadata = VALUES(metadata);

INSERT INTO audit_logs (action, details, performed_by) VALUES
  ('SEED_DATA_LOADED', 'Loaded members, staff, classes and finance seed rows', 'seed_staff_admin'),
  ('SEED_CLASS_BOOKING', 'Created seed class bookings for scheduling validation', 'seed_staff_reception'),
  ('SEED_FINANCE_CHECK', 'Created seed finance transactions and budgets', 'seed_staff_accounting');


-- Resumen rapido para verificar despues de ejecutar el seed.
SELECT 'members' AS table_name, COUNT(*) AS rows_loaded FROM members WHERE id LIKE 'seed_%'
UNION ALL SELECT 'staff', COUNT(*) FROM staff WHERE id LIKE 'seed_%'
UNION ALL SELECT 'users', COUNT(*) FROM users WHERE id LIKE 'seed_%'
UNION ALL SELECT 'employees', COUNT(*) FROM employees WHERE id LIKE 'seed_%'
UNION ALL SELECT 'class_sessions', COUNT(*) FROM class_sessions WHERE id LIKE 'seed_%'
UNION ALL SELECT 'class_bookings', COUNT(*) FROM class_bookings WHERE id LIKE 'seed_%'
UNION ALL SELECT 'private_sessions', COUNT(*) FROM private_sessions WHERE id LIKE 'seed_%'
UNION ALL SELECT 'invoices', COUNT(*) FROM invoices WHERE id LIKE 'seed_%'
UNION ALL SELECT 'finance_transactions', COUNT(*) FROM finance_transactions WHERE id LIKE 'seed_%'
UNION ALL SELECT 'support_tickets', COUNT(*) FROM support_tickets WHERE id LIKE 'seed_%';
