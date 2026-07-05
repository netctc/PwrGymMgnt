import mysql from 'mysql2/promise';
import 'dotenv/config';
import { getDatabaseEnv, getMissingDatabaseEnv } from './db-env.mjs';

const dbConfig = getDatabaseEnv();
const missing = getMissingDatabaseEnv(dbConfig);

if (missing.length > 0) {
  console.error(`Missing database environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const connection = await mysql.createConnection({
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database,
  connectTimeout: dbConfig.connectTimeout,
  multipleStatements: true,
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function count(table, id) {
  const [rows] = await connection.query(`SELECT COUNT(*) AS total FROM \`${table}\` WHERE id = ?`, [id]);
  return Number(rows[0].total || 0);
}

const stamp = Date.now();
const ids = {
  member: `verify_member_${stamp}`,
  staff: `verify_staff_${stamp}`,
  employee: `verify_employee_${stamp}`,
  plan: `verify_plan_${stamp}`,
  classSession: `verify_class_${stamp}`,
  finance: `verify_finance_${stamp}`,
  support: `verify_support_${stamp}`,
  notification: `verify_notification_${stamp}`,
};

try {
  await connection.beginTransaction();

  await connection.query(
    `INSERT INTO members (id, first_name, last_name, email, phone, status, join_date, plan, data)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_DATE(), ?, ?)`,
    [ids.member, 'Verify', 'Member', `${ids.member}@example.test`, '+100000000', 'active', 'Verification Plan', JSON.stringify({ verification: true })],
  );
  assert(await count('members', ids.member) === 1, 'members create/read failed');
  await connection.query('UPDATE members SET phone = ? WHERE id = ?', ['+199999999', ids.member]);
  const [memberRows] = await connection.query('SELECT phone FROM members WHERE id = ?', [ids.member]);
  assert(memberRows[0].phone === '+199999999', 'members update failed');

  await connection.query(
    `INSERT INTO users (id, email, role, data) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE email = VALUES(email), role = VALUES(role), data = VALUES(data)`,
    [ids.staff, `${ids.staff}@example.test`, 'trainer', JSON.stringify({ firstName: 'Verify', lastName: 'Staff', role: 'trainer' })],
  );
  await connection.query(
    `INSERT INTO staff (id, first_name, last_name, email, role, status, data) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE first_name = VALUES(first_name), last_name = VALUES(last_name), email = VALUES(email), role = VALUES(role), status = VALUES(status), data = VALUES(data)`,
    [ids.staff, 'Verify', 'Staff', `${ids.staff}@example.test`, 'trainer', 'active', JSON.stringify({ verification: true })],
  );
  assert(await count('users', ids.staff) === 1, 'users staff create/read failed');
  assert(await count('staff', ids.staff) === 1, 'staff create/read failed');
  await connection.query('UPDATE staff SET role = ? WHERE id = ?', ['reception', ids.staff]);
  const [staffRows] = await connection.query('SELECT role FROM staff WHERE id = ?', [ids.staff]);
  assert(staffRows[0].role === 'reception', 'staff update failed');

  await connection.query(
    `INSERT INTO employees (id, employee_code, first_name, last_name, email, employment_status, contract_type, base_salary, pay_frequency)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [ids.employee, ids.employee, 'Verify', 'Employee', `${ids.employee}@example.test`, 'active', 'full-time', 1000, 'monthly'],
  );
  assert(await count('employees', ids.employee) === 1, 'employees create/read failed');
  await connection.query('UPDATE employees SET base_salary = ? WHERE id = ?', [1200, ids.employee]);
  const [employeeRows] = await connection.query('SELECT base_salary FROM employees WHERE id = ?', [ids.employee]);
  assert(Number(employeeRows[0].base_salary) === 1200, 'employees update failed');

  await connection.query(
    'INSERT INTO subscription_plans (id, name, duration_days, price, currency, status) VALUES (?, ?, ?, ?, ?, ?)',
    [ids.plan, 'Verify Plan', 30, 10, 'USD', 'active'],
  );
  assert(await count('subscription_plans', ids.plan) === 1, 'subscription_plans create/read failed');
  await connection.query('UPDATE subscription_plans SET price = ? WHERE id = ?', [20, ids.plan]);

  await connection.query(
    `INSERT INTO class_sessions (id, title, trainer_id, trainer_name, capacity, start_time, end_time, room, status)
     VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 1 DAY) + INTERVAL 1 HOUR, ?, ?)`,
    [ids.classSession, 'Verify Class', ids.staff, 'Verify Staff', 10, 'Verification Room', 'scheduled'],
  );
  assert(await count('class_sessions', ids.classSession) === 1, 'class_sessions create/read failed');
  await connection.query('UPDATE class_sessions SET capacity = ? WHERE id = ?', [12, ids.classSession]);

  await connection.query(
    `INSERT INTO finance_transactions (id, type, category, amount, transaction_date, reference_type, description, status)
     VALUES (?, ?, ?, ?, CURRENT_DATE(), ?, ?, ?)`,
    [ids.finance, 'income', 'Verification', 15, `verification_${stamp}`, 'DB verification', 'posted'],
  );
  assert(await count('finance_transactions', ids.finance) === 1, 'finance_transactions create/read failed');
  await connection.query('UPDATE finance_transactions SET amount = ? WHERE id = ?', [25, ids.finance]);

  await connection.query(
    `INSERT INTO support_tickets (id, ticket_number, requester_name, requester_email, inquiry_type, priority, subject, description, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [ids.support, `VFY-${stamp}`, 'Verify User', `${ids.support}@example.test`, 'technical', 'normal', 'Verification', 'DB verification', 'open'],
  );
  assert(await count('support_tickets', ids.support) === 1, 'support_tickets create/read failed');

  await connection.query(
    `INSERT INTO notifications (id, user_id, role, title, body, type, channel) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [ids.notification, ids.staff, 'admin', 'Verify', 'DB verification', 'info', 'in_app'],
  );
  assert(await count('notifications', ids.notification) === 1, 'notifications create/read failed');

  await connection.rollback();
  console.log('MySQL read/create/update verification passed for members, staff/users, employees, plans, classes, finance, support, and notifications. Test rows were rolled back.');
} catch (error) {
  await connection.rollback().catch(() => undefined);
  console.error('MySQL verification failed:', error.message);
  process.exitCode = 1;
} finally {
  await connection.end();
}
