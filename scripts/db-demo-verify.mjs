import mysql from 'mysql2/promise';
import process from 'node:process';
import 'dotenv/config';
import { getDatabaseEnv, getMissingDatabaseEnv } from './db-env.mjs';
import { formatDemoReadiness, makeDemoCheck, summarizeDemoReadiness } from './db-demo-verify-utils.mjs';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { json: false, strict: true };
  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else if (arg === '--strict=false' || arg === '--warn-only') args.strict = false;
  }
  return args;
}

async function tableExists(connection, tableName) {
  const [rows] = await connection.query('SHOW TABLES LIKE ?', [tableName]);
  return Array.isArray(rows) && rows.length > 0;
}

async function countQuery(connection, id, label, sql, params = [], expected = 1, severity = 'critical', hint = '') {
  try {
    const [rows] = await connection.query(sql, params);
    const first = Array.isArray(rows) ? rows[0] : undefined;
    const actual = Number(first?.count ?? first?.value ?? first?.actual ?? 0);
    return makeDemoCheck({ id, label, actual, expected, severity, details: { hint } });
  } catch (error) {
    return makeDemoCheck({
      id,
      label,
      actual: 0,
      expected,
      severity,
      details: { hint: hint || String(error?.message || error) },
    });
  }
}

async function verifyDemoScenario(connection) {
  const requiredTables = [
    'admin_users',
    'feature_flags',
    'access_points',
    'members',
    'member_subscriptions',
    'plan_versions',
    'subscriptions',
    'subscription_members',
    'affiliations',
    'subscription_cycles',
    'session_balances',
    'session_movements',
    'access_attempts',
    'invoices',
    'access_tokens',
    'employees',
    'hr_departments',
    'hr_job_titles',
    'private_sessions',
    'class_sessions',
    'class_bookings',
    'warehouse_products',
    'warehouse_categories',
    'warehouse_suppliers',
    'warehouse_purchase_orders',
    'warehouse_pos_sales',
    'warehouse_stock_movements',
    'finance_transactions',
    'support_tickets',
    'notifications',
    'audit_logs',
  ];

  const checks = [];
  for (const table of requiredTables) {
    const exists = await tableExists(connection, table);
    checks.push(makeDemoCheck({
      id: `table.${table}`,
      label: `Table exists: ${table}`,
      actual: exists ? 1 : 0,
      expected: 1,
      severity: 'critical',
      details: { hint: `Run npm run db:migrate before demo reset if ${table} is missing.` },
    }));
  }

  const scenarioChecks = [
    ['auth.accountsPreserved', 'Preserved authentication accounts', 'SELECT COUNT(*) AS count FROM admin_users', [], 1, 'critical', 'The operational reset must preserve existing authentication accounts.'],
    ['workforce.staffPreserved', 'Preserved staff records', 'SELECT COUNT(*) AS count FROM staff', [], 1, 'critical', 'The operational reset must preserve existing staff.'],
    ['workforce.employeesPreserved', 'Preserved employee records', 'SELECT COUNT(*) AS count FROM employees', [], 1, 'critical', 'The operational reset must preserve existing employees.'],
    ['features.enabled', 'Evolution feature flags enabled', 'SELECT COUNT(*) AS count FROM feature_flags WHERE enabled = 1', [], 6, 'critical', 'All current subscription, session and access features should be enabled for the demo.'],
    ['access.points', 'Configured access points', 'SELECT COUNT(*) AS count FROM access_points', [], 3, 'warning', 'Access-control testing needs entry, studio and exit points.'],
    ['members.total', 'Members', 'SELECT COUNT(*) AS count FROM members', [], 20, 'critical', 'The demo seed should create at least 20 members.'],
    ['members.active.future', 'Active members with future subscriptions', "SELECT COUNT(*) AS count FROM member_subscriptions WHERE LOWER(TRIM(status)) = 'active' AND DATE(end_date) >= CURDATE()", [], 14, 'critical', 'Active QR/e-card scenarios require active future subscriptions.'],
    ['members.expired', 'Expired subscription scenarios', "SELECT COUNT(*) AS count FROM member_subscriptions WHERE DATE(end_date) < CURDATE() OR LOWER(TRIM(status)) = 'expired'", [], 3, 'critical', 'Expired scenarios are needed for status and access-denied testing.'],
    ['members.pending.paused', 'Pending or paused member scenarios', "SELECT COUNT(*) AS count FROM members WHERE LOWER(TRIM(status)) IN ('pending','paused')", [], 2, 'warning', 'Pending/paused scenarios improve UI and access workflow testing.'],
    ['subscriptions.v2', 'V2 subscriptions', 'SELECT COUNT(*) AS count FROM subscriptions', [], 6, 'critical', 'The comprehensive seed must include current-schema subscriptions.'],
    ['subscriptions.statusCoverage', 'Subscription status coverage', 'SELECT COUNT(DISTINCT status) AS count FROM subscriptions', [], 7, 'warning', 'The demo should cover active, suspended, expired, cancelled, frozen, draft and archived subscriptions.'],
    ['subscriptions.multiUser', 'Multi-user subscription types', "SELECT COUNT(DISTINCT pv.plan_type) AS count FROM subscriptions s JOIN plan_versions pv ON pv.id = s.plan_version_id WHERE pv.plan_type IN ('family','group','corporate')", [], 3, 'critical', 'Family, group and corporate workflows require representative subscriptions.'],
    ['subscriptions.paymentStates', 'Subscription payment states', 'SELECT COUNT(DISTINCT payment_status) AS count FROM subscriptions', [], 6, 'critical', 'Paid, pending, partial, overdue, refunded and waived workflows need demo coverage.'],
    ['sessions.limitedEligible', 'Members eligible for limited-session Private PT', "SELECT COUNT(DISTINCT a.member_id) AS count FROM affiliations a JOIN subscriptions s ON s.id = a.subscription_id JOIN plan_versions pv ON pv.id = a.plan_version_id WHERE LOWER(TRIM(a.status)) = 'active' AND LOWER(TRIM(s.status)) = 'active' AND a.start_date <= CURDATE() AND a.end_date >= CURDATE() AND s.start_date <= CURDATE() AND s.end_date >= CURDATE() AND pv.sessions_unlimited = 0", [], 4, 'critical', 'Private PT must have members with at least one current limited-session affiliation.'],
    ['sessions.consumed', 'Immutable consumed-session movements', "SELECT COUNT(*) AS count FROM session_movements WHERE direction = '-' AND movement_type IN ('consumption','adjustment_negative')", [], 4, 'critical', 'Consumed-session reporting needs immutable ledger movements.'],
    ['access.attempts', 'Access control decisions', 'SELECT COUNT(*) AS count FROM access_attempts', [], 5, 'warning', 'QR, card, biometric and manual access decisions should be represented.'],
    ['billing.invoices', 'Membership invoices', 'SELECT COUNT(*) AS count FROM invoices', [], 20, 'critical', 'Receipt and renewal screens need invoices.'],
    ['access.tokens', 'Active QR/e-card tokens', "SELECT COUNT(*) AS count FROM access_tokens WHERE LOWER(TRIM(status)) = 'active' AND expires_at > NOW()", [], 14, 'critical', 'QR Access needs active demo tokens.'],
    ['employees.total', 'Preserved employees', 'SELECT COUNT(*) AS count FROM employees', [], 1, 'critical', 'At least one preserved employee is required.'],
    ['employees.trainers', 'Preserved trainers', "SELECT COUNT(*) AS count FROM employees WHERE LOWER(TRIM(department)) = 'trainer'", [], 1, 'warning', 'A trainer is recommended; otherwise the reset reuses another active employee for schedules.'],
    ['employees.departments', 'HR departments', 'SELECT COUNT(*) AS count FROM hr_departments', [], 8, 'warning', 'HR maintenance needs representative departments.'],
    ['employees.jobTitles', 'HR job titles', 'SELECT COUNT(*) AS count FROM hr_job_titles', [], 8, 'warning', 'HR maintenance needs representative job titles.'],
    ['training.private', 'Private training sessions', 'SELECT COUNT(*) AS count FROM private_sessions', [], 10, 'critical', 'PT screens need 10 sessions.'],
    ['classes.sessions', 'Group classes', 'SELECT COUNT(*) AS count FROM class_sessions', [], 6, 'critical', 'Class scheduling needs group classes.'],
    ['classes.bookings', 'Class bookings', 'SELECT COUNT(*) AS count FROM class_bookings', [], 20, 'critical', 'Class capacity and enrollment reports need bookings.'],
    ['classes.attendanceStates', 'Consumed and no-show class bookings', "SELECT COUNT(DISTINCT status) AS count FROM class_bookings WHERE LOWER(TRIM(status)) IN ('attended','no_show')", [], 2, 'warning', 'Completed classes should demonstrate attendance consumption and no-show handling.'],
    ['warehouse.products', 'Warehouse products', 'SELECT COUNT(*) AS count FROM warehouse_products', [], 30, 'critical', 'Warehouse/POS requires 30 products.'],
    ['warehouse.categories', 'Product categories', 'SELECT COUNT(DISTINCT category) AS count FROM warehouse_products', [], 3, 'critical', 'The catalog should contain at least 3 categories.'],
    ['warehouse.categoryMaster', 'Warehouse category master', 'SELECT COUNT(*) AS count FROM warehouse_categories', [], 4, 'warning', 'Warehouse category maintenance needs a clean reference catalog.'],
    ['warehouse.suppliers', 'Suppliers', 'SELECT COUNT(*) AS count FROM warehouse_suppliers', [], 6, 'critical', 'Purchasing scenarios need suppliers.'],
    ['warehouse.purchaseOrders', 'Purchase orders', 'SELECT COUNT(*) AS count FROM warehouse_purchase_orders', [], 6, 'critical', 'Supplier and purchasing screens need POs.'],
    ['warehouse.purchaseOrderHistory', 'Purchase-order status history', 'SELECT COUNT(*) AS count FROM warehouse_purchase_order_status_history', [], 10, 'warning', 'Purchase workflows need status-transition history.'],
    ['warehouse.receivedPOs', 'Received/invoiced POs', "SELECT COUNT(*) AS count FROM warehouse_purchase_orders WHERE LOWER(TRIM(status)) IN ('received','invoiced')", [], 3, 'critical', 'Accounting integration needs received/invoiced POs.'],
    ['warehouse.posSales', 'POS sales', 'SELECT COUNT(*) AS count FROM warehouse_pos_sales', [], 10, 'critical', 'POS summaries and accounting sync require sale history.'],
    ['warehouse.stockMovements', 'Stock movements', 'SELECT COUNT(*) AS count FROM warehouse_stock_movements', [], 20, 'critical', 'Inventory audit trail needs stock movements.'],
    ['accounting.transactions', 'Accounting transactions', 'SELECT COUNT(*) AS count FROM finance_transactions', [], 30, 'critical', 'Financial dashboards need demo transaction history.'],
    ['accounting.membership', 'Membership income transactions', "SELECT COUNT(*) AS count FROM finance_transactions WHERE source = 'membership' AND category = 'Membership Renewal'", [], 14, 'critical', 'Paid membership invoices should be mirrored in accounting.'],
    ['accounting.posIncome', 'POS income transactions', "SELECT COUNT(*) AS count FROM finance_transactions WHERE source = 'warehouse_pos' AND type = 'income' AND category = 'POS Sales'", [], 10, 'critical', 'Each POS sale should create income.'],
    ['accounting.cogs', 'COGS expense transactions', "SELECT COUNT(*) AS count FROM finance_transactions WHERE source = 'warehouse_pos' AND type = 'expense' AND category = 'Cost of Goods Sold'", [], 10, 'critical', 'Each POS sale should create COGS.'],
    ['accounting.purchases', 'Inventory purchase expenses', "SELECT COUNT(*) AS count FROM finance_transactions WHERE source = 'warehouse' AND type = 'expense' AND category = 'Inventory Purchase'", [], 3, 'critical', 'Received/invoiced POs should post purchase expenses.'],
    ['warehouse.lowOrOut', 'Low/out-of-stock products', 'SELECT COUNT(*) AS count FROM warehouse_products WHERE stock_quantity <= min_stock', [], 5, 'warning', 'Low/out-of-stock scenarios support replenishment alerts.'],
    ['support.tickets', 'Support tickets', 'SELECT COUNT(*) AS count FROM support_tickets', [], 4, 'warning', 'Support screens work better with demo tickets.'],
    ['notifications.total', 'Notifications', 'SELECT COUNT(*) AS count FROM notifications', [], 6, 'warning', 'Notification center should have sample items.'],
    ['audit.logs', 'Audit logs', 'SELECT COUNT(*) AS count FROM audit_logs', [], 8, 'warning', 'Security observability should have sample activity.'],
  ];

  for (const [id, label, sql, params, expected, severity, hint] of scenarioChecks) {
    checks.push(await countQuery(connection, id, label, sql, params, expected, severity, hint));
  }

  checks.push(await countQuery(
    connection,
    'sync.pos.accounting',
    'POS sales mirrored by income and COGS entries',
    `SELECT LEAST(
      (SELECT COUNT(*) FROM warehouse_pos_sales WHERE status = 'paid'),
      (SELECT COUNT(*) FROM finance_transactions WHERE source = 'warehouse_pos' AND type = 'income'),
      (SELECT COUNT(*) FROM finance_transactions WHERE source = 'warehouse_pos' AND type = 'expense' AND category = 'Cost of Goods Sold')
    ) AS count`,
    [],
    10,
    'critical',
    'Every paid POS sale should have income and COGS finance entries.',
  ));

  checks.push(await countQuery(
    connection,
    'sync.paidInvoices.accounting',
    'Paid membership invoices mirrored in accounting',
    `SELECT LEAST(
      (SELECT COUNT(*) FROM invoices WHERE status = 'paid'),
      (SELECT COUNT(*) FROM finance_transactions WHERE source = 'membership' AND reference_type = 'membership_invoice')
    ) AS count`,
    [],
    14,
    'critical',
    'Paid invoices should create Membership Renewal income transactions.',
  ));

  const summary = summarizeDemoReadiness(checks);
  return { summary, checks };
}

async function main() {
  const args = parseArgs();
  const dbConfig = getDatabaseEnv();
  const missing = getMissingDatabaseEnv(dbConfig);
  if (missing.length > 0) {
    const output = { status: 'fail', error: `Missing database environment variables: ${missing.join(', ')}` };
    console.error(args.json ? JSON.stringify(output, null, 2) : output.error);
    process.exit(1);
  }

  const connection = await mysql.createConnection({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    connectTimeout: dbConfig.connectTimeout,
  });

  try {
    const result = await verifyDemoScenario(connection);
    const output = {
      database: `${dbConfig.database}@${dbConfig.host}:${dbConfig.port}`,
      ...result,
    };
    if (args.json) console.log(JSON.stringify(output, null, 2));
    else console.log(formatDemoReadiness(result.summary, result.checks));

    if (args.strict && result.summary.status === 'fail') process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
