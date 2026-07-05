import mysql from 'mysql2/promise';
import 'dotenv/config';
import { getDatabaseEnv, getMissingDatabaseEnv } from './db-env.mjs';

const expectedIndexes = [
  { table: 'users', index: 'idx_users_role_created', columns: ['role', 'created_at'], reason: 'role-filtered user/staff dashboard reads' },
  { table: 'members', index: 'idx_members_status_created', columns: ['status', 'created_at'], reason: 'member status and sign-up trend reads' },
  { table: 'members', index: 'idx_members_status_plan', columns: ['status', 'plan'], reason: 'membership distribution reads' },
  { table: 'member_subscriptions', index: 'idx_member_subscriptions_status_end_member', columns: ['status', 'end_date', 'member_id'], reason: 'active subscription lookups' },
  { table: 'class_sessions', index: 'idx_class_sessions_time_status_trainer', columns: ['start_time', 'status', 'trainer_id'], reason: 'weekly class and trainer utilization reads' },
  { table: 'classes', index: 'idx_classes_time_instructor', columns: ['start_time', 'instructor_id'], reason: 'legacy class compatibility reads during migration' },
  { table: 'private_sessions', index: 'idx_private_sessions_time_status_trainer', columns: ['start_time', 'status', 'trainer_id'], reason: 'private trainer utilization reads' },
  { table: 'shifts', index: 'idx_shifts_time_user', columns: ['start_time', 'end_time', 'user_id'], reason: 'active shift and staffing reads; skipped for JSON-only legacy compatibility table until typed Staff migration' },
  { table: 'finance_transactions', index: 'idx_finance_tx_date_status_type', columns: ['transaction_date', 'status', 'type'], reason: 'finance summary and trend reads' },
  { table: 'warehouse_products', index: 'idx_wh_products_status_updated_name', columns: ['status', 'updated_at', 'name'], reason: 'warehouse product list first-load reads' },
  { table: 'warehouse_products', index: 'idx_wh_products_status_category_updated', columns: ['status', 'category_id', 'updated_at'], reason: 'warehouse category-filtered product reads' },
  { table: 'warehouse_suppliers', index: 'idx_wh_suppliers_status_name', columns: ['status', 'name'], reason: 'warehouse supplier list reads' },
  { table: 'warehouse_purchase_orders', index: 'idx_wh_po_status_created', columns: ['status', 'created_at'], reason: 'warehouse purchase order list reads' },
  { table: 'warehouse_purchase_orders', index: 'idx_wh_po_supplier_created', columns: ['supplier_id', 'created_at'], reason: 'supplier-filtered purchase order reads' },
  { table: 'warehouse_pos_sales', index: 'idx_wh_sales_status_date', columns: ['status', 'sale_date'], reason: 'warehouse POS sales date/status reads' },
  { table: 'warehouse_pos_sales', index: 'idx_wh_sales_payment_date', columns: ['payment_method', 'sale_date'], reason: 'warehouse POS payment/date reads' },
];

const config = getDatabaseEnv();
const missing = getMissingDatabaseEnv(config);

if (missing.length > 0) {
  console.error(`Missing database environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const connection = await mysql.createConnection({
  host: config.host,
  port: config.port,
  user: config.user,
  password: config.password,
  database: config.database,
  connectTimeout: config.connectTimeout,
});

try {
  const [indexRows] = await connection.query(
    `SELECT TABLE_NAME AS tableName, INDEX_NAME AS indexName
       FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()`
  );
  const [tableRows] = await connection.query(
    `SELECT TABLE_NAME AS tableName
       FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()`
  );
  const [columnRows] = await connection.query(
    `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()`
  );

  const existingIndexes = new Set(indexRows.map((row) => `${row.tableName}.${row.indexName}`));
  const existingTables = new Set(tableRows.map((row) => row.tableName));
  const existingColumns = new Set(columnRows.map((row) => `${row.tableName}.${row.columnName}`));

  const results = expectedIndexes.map((item) => {
    const tableExists = existingTables.has(item.table);
    const missingColumns = item.columns.filter((column) => !existingColumns.has(`${item.table}.${column}`));
    const present = existingIndexes.has(`${item.table}.${item.index}`);
    const status = present
      ? 'present'
      : !tableExists
        ? 'skipped_missing_table'
        : missingColumns.length > 0
          ? 'skipped_missing_columns'
          : 'missing';

    return {
      ...item,
      tableExists,
      present,
      status,
      missingColumns,
    };
  });

  const missingIndexes = results.filter((item) => item.status === 'missing');
  const skipped = results.filter((item) => item.status.startsWith('skipped_'));
  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    expected: expectedIndexes.length,
    present: results.filter((item) => item.status === 'present').length,
    missing: missingIndexes.length,
    skipped: skipped.length,
    results,
  }, null, 2));

  if (missingIndexes.length > 0) {
    console.error(`Missing ${missingIndexes.length} performance index(es). Run: npm run db:migrate`);
    process.exit(2);
  }

  if (skipped.length > 0) {
    console.warn(`Skipped ${skipped.length} performance index(es) because required tables/columns are not present in this deployment.`);
  }
} finally {
  await connection.end();
}
