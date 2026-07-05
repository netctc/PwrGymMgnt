import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import process from 'node:process';
import mysql from 'mysql2/promise';
import 'dotenv/config';
import { getDatabaseEnv, getMissingDatabaseEnv } from './db-env.mjs';

const CONFIRMATION = 'RESET_DEMO_DATA';
const DEFAULT_PASSWORD = 'PowerGym@2026!';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { confirm: '', migrate: true, allowProduction: false, dryRun: false, json: false };
  for (const arg of argv) {
    if (arg === '--skip-migrations') args.migrate = false;
    else if (arg === '--allow-production') args.allowProduction = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--json') args.json = true;
    else if (arg.startsWith('--confirm=')) args.confirm = arg.slice('--confirm='.length);
  }
  return args;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function mysqlJson(value) {
  return JSON.stringify(value ?? {});
}

function pad(value, length = 3) {
  return String(value).padStart(length, '0');
}

function dateOffset(days) {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateTimeOffset(days, hour = 10, minute = 0) {
  const date = new Date();
  date.setUTCHours(hour, minute, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function monthOffset(months) {
  const date = new Date();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 7);
}

function addMonths(date, months) {
  const d = new Date(`${date}T12:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function createId(prefix, value) {
  return `${prefix}_${value}`;
}

function money(value) {
  return Number(value.toFixed(2));
}

async function runMigrations() {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/apply-migrations.mjs'], {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: process.env,
      shell: false,
    });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`Migration runner exited with code ${code}`)));
  });
}

async function tableExists(connection, tableName) {
  const [rows] = await connection.query('SHOW TABLES LIKE ?', [tableName]);
  return Array.isArray(rows) && rows.length > 0;
}


async function columnExists(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [tableName, columnName],
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function addColumnIfMissing(connection, tableName, columnName, definition) {
  if (!(await tableExists(connection, tableName))) return false;
  if (await columnExists(connection, tableName, columnName)) return false;
  await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
  return true;
}

async function ensureDemoSchemaCompatibility(connection) {
  await addColumnIfMissing(connection, 'class_bookings', 'member_name', 'VARCHAR(180) NULL');
  await addColumnIfMissing(connection, 'class_bookings', 'cancelled_at', 'DATETIME NULL');
  await addColumnIfMissing(connection, 'members', 'last_access_at', 'DATETIME NULL');
  await addColumnIfMissing(connection, 'payroll_items', 'paid_at', 'DATETIME NULL');
}

async function truncateIfExists(connection, tableName) {
  if (!(await tableExists(connection, tableName))) return false;
  await connection.query(`TRUNCATE TABLE \`${tableName}\``);
  return true;
}

async function bulkInsert(connection, table, columns, rows) {
  if (!rows.length) return 0;
  const placeholders = rows.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
  const values = rows.flatMap((row) => columns.map((column) => row[column]));
  await connection.query(`INSERT INTO \`${table}\` (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES ${placeholders}`, values);
  return rows.length;
}

function buildDemoDataset() {
  const passwordHash = hashPassword(DEFAULT_PASSWORD);
  const taxRate = 0.05;

  const adminUsers = [
    { email: 'superadmin@powergym.demo', role: 'super_admin' },
    { email: 'admin@powergym.demo', role: 'admin' },
    { email: 'manager@powergym.demo', role: 'manager' },
    { email: 'accounting@powergym.demo', role: 'accounting' },
    { email: 'warehouse.manager@powergym.demo', role: 'warehouse_manager' },
    { email: 'cashier@powergym.demo', role: 'cashier' },
    { email: 'reception@powergym.demo', role: 'reception' },
    { email: 'trainer@powergym.demo', role: 'trainer' },
  ].map((user) => ({ ...user, password_hash: passwordHash }));

  const users = adminUsers.map((user, index) => ({
    id: `user_${pad(index + 1)}`,
    email: user.email,
    role: user.role,
    data: mysqlJson({ demo: true, seededLoginPassword: DEFAULT_PASSWORD }),
  }));

  const subscriptionPlans = [
    ['plan_basic_monthly', 'Basic Monthly', 'Gym floor access and standard classes', 30, 49],
    ['plan_premium_monthly', 'Premium Monthly', 'Gym floor, classes and sauna access', 30, 79],
    ['plan_elite_monthly', 'Elite Monthly', 'Premium access plus member pricing and priority booking', 30, 119],
    ['plan_student_monthly', 'Student Monthly', 'Discounted monthly plan for students', 30, 39],
    ['plan_annual', 'Annual Unlimited', 'One year unlimited membership', 365, 899],
  ].map(([id, name, description, duration_days, price]) => ({
    id,
    name,
    description,
    duration_days,
    price,
    currency: 'USD',
    status: 'active',
    data: mysqlJson({ demo: true }),
  }));

  const plans = subscriptionPlans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    price: plan.price,
    duration_days: plan.duration_days,
    status: plan.status,
    data: plan.data,
  }));

  const firstNames = ['Alex', 'Maya', 'Omar', 'Sara', 'Daniel', 'Nora', 'Liam', 'Ava', 'Noah', 'Emma', 'Leo', 'Sofia', 'Adam', 'Layla', 'Ethan', 'Zara', 'Mila', 'Yusuf', 'Amir', 'Olivia'];
  const lastNames = ['Rivera', 'Chen', 'Hassan', 'Jenkins', 'Cooper', 'Patel', 'Stone', 'Reyes', 'Walker', 'Khan', 'Diaz', 'Morgan', 'Ibrahim', 'Smith', 'Young', 'Rossi', 'Bennett', 'Ali', 'Wilson', 'Taylor'];
  const memberPlanIds = ['plan_elite_monthly', 'plan_premium_monthly', 'plan_basic_monthly', 'plan_student_monthly', 'plan_annual'];
  const members = [];
  const memberSubscriptions = [];
  const legacySubscriptions = [];
  const invoices = [];
  const accessTokens = [];

  for (let i = 1; i <= 20; i += 1) {
    const plan = subscriptionPlans[(i - 1) % subscriptionPlans.length];
    const expired = [7, 14, 19].includes(i);
    const paused = [9].includes(i);
    const pending = [17].includes(i);
    const status = paused ? 'paused' : pending ? 'pending' : 'active';
    const startDate = expired ? dateOffset(-120 - i) : dateOffset(-20 - i);
    const endDate = expired ? dateOffset(-i) : addMonths(dateOffset(10 + i), plan.id === 'plan_annual' ? 11 : 1);
    const memberId = createId('mem', pad(i));
    const subId = createId('sub', pad(i));
    const invoiceId = createId('inv', pad(i));
    const subtotal = Number(plan.price);
    const tax = money(subtotal * taxRate);
    const total = money(subtotal + tax);

    members.push({
      id: memberId,
      first_name: firstNames[i - 1],
      last_name: lastNames[i - 1],
      email: `${firstNames[i - 1].toLowerCase()}.${lastNames[i - 1].toLowerCase()}@demo.powergym.local`,
      phone: `+1555001${pad(i, 3)}`,
      status,
      join_date: dateTimeOffset(-220 + i, 9),
      plan: plan.name,
      qr_code: `DEMO-QR-${pad(i)}`,
      last_access_at: expired || pending ? null : dateTimeOffset(-(i % 5), 8 + (i % 8), 15),
      data: mysqlJson({
        demo: true,
        memberCode: `PGM-${pad(i)}`,
        preferredChannel: i % 3 === 0 ? 'whatsapp' : 'email',
        currentExpiry: endDate,
        loyaltyTier: i <= 5 ? 'elite' : i <= 12 ? 'premium' : 'standard',
      }),
    });

    memberSubscriptions.push({
      id: subId,
      member_id: memberId,
      plan_id: memberPlanIds[(i - 1) % memberPlanIds.length],
      plan_name: plan.name,
      status: expired ? 'expired' : status === 'pending' ? 'pending' : 'active',
      start_date: startDate,
      end_date: endDate,
      price: subtotal,
      currency: 'USD',
      data: mysqlJson({ demo: true, scenario: expired ? 'expired-member' : 'active-member' }),
    });

    legacySubscriptions.push({
      id: createId('legacy_sub', pad(i)),
      member_id: memberId,
      plan_id: plan.id,
      start_date: `${startDate} 00:00:00`,
      end_date: `${endDate} 23:59:59`,
      status: expired ? 'expired' : status === 'pending' ? 'pending' : 'active',
      amount: subtotal,
      data: mysqlJson({ demo: true, source: 'legacy-compatibility' }),
    });

    invoices.push({
      id: invoiceId,
      invoice_number: `INV-DEMO-${pad(i, 4)}`,
      member_id: memberId,
      subscription_id: subId,
      status: pending ? 'issued' : expired ? 'overdue' : 'paid',
      subtotal,
      tax_amount: tax,
      total,
      currency: 'USD',
      due_date: expired ? dateOffset(-i) : dateOffset(7 + i),
      paid_at: pending || expired ? null : dateTimeOffset(-i, 14),
      data: mysqlJson({ demo: true, receiptAvailable: !pending && !expired }),
    });

    if (!expired && !pending) {
      const rawToken = `powergym-demo-access-token-${pad(i)}-${crypto.randomBytes(8).toString('hex')}`;
      accessTokens.push({
        id: createId('tok', pad(i)),
        member_id: memberId,
        token_hash: sha256(rawToken),
        status: 'active',
        expires_at: dateTimeOffset(45 + i, 23, 59),
        revoked_at: null,
        data: mysqlJson({ demo: true, demoRawToken: rawToken, note: 'Demo only. Do not store raw tokens in production.' }),
      });
    }
  }

  const employees = [
    ['emp_001', 'EMP-001', 'Lena', 'Martinez', 'trainer', 'Senior Strength Trainer', 4200],
    ['emp_002', 'EMP-002', 'Marcus', 'Thorne', 'trainer', 'PT Specialist', 3900],
    ['emp_003', 'EMP-003', 'Elena', 'Rossi', 'trainer', 'Yoga & Mobility Trainer', 3600],
    ['emp_004', 'EMP-004', 'David', 'Chen', 'trainer', 'Boxing Coach', 3800],
    ['emp_005', 'EMP-005', 'Hana', 'Kim', 'trainer', 'HIIT Trainer', 3700],
    ['emp_006', 'EMP-006', 'Sarah', 'Jenkins', 'operations', 'Warehouse Manager', 4300],
    ['emp_007', 'EMP-007', 'Bilal', 'Nasser', 'frontdesk', 'Reception Lead', 3000],
    ['emp_008', 'EMP-008', 'Priya', 'Shah', 'finance', 'Accountant', 4100],
    ['emp_009', 'EMP-009', 'Tom', 'Baker', 'sales', 'Cashier', 2600],
    ['emp_010', 'EMP-010', 'Nadine', 'Khalil', 'support', 'Support Agent', 2800],
  ].map(([id, employee_code, first_name, last_name, department, job_title, base_salary], index) => ({
    id,
    employee_code,
    first_name,
    last_name,
    email: `${String(first_name).toLowerCase()}.${String(last_name).toLowerCase()}@demo.powergym.local`,
    phone: `+1555100${pad(index + 1, 3)}`,
    department,
    job_title,
    employment_status: 'active',
    contract_type: 'full-time',
    hire_date: dateOffset(-600 + index * 30),
    base_salary,
    pay_frequency: 'monthly',
    allowance_housing: department === 'trainer' ? 400 : 300,
    allowance_transport: 150,
    allowance_medical: 125,
    deduction_tax: money(Number(base_salary) * 0.08),
    deduction_insurance: 95,
    vacation_days_remaining: 18 - index,
    data: mysqlJson({ demo: true, certifications: department === 'trainer' ? ['CPT', 'CPR'] : [] }),
  }));

  const staff = employees.map((employee) => ({
    id: `staff_${employee.id}`,
    first_name: employee.first_name,
    last_name: employee.last_name,
    email: employee.email,
    role: employee.department === 'trainer' ? 'trainer' : employee.department === 'finance' ? 'accounting' : employee.department === 'operations' ? 'warehouse_manager' : 'staff',
    status: employee.employment_status,
    data: employee.data,
  }));

  const classSessions = [
    ['cls_001', 'Morning HIIT', 'emp_005', 'Hana Kim', 18, 1, 7, 'Studio A', 'scheduled', 'HIIT', 'Intermediate'],
    ['cls_002', 'Strength Foundations', 'emp_001', 'Lena Martinez', 14, 2, 18, 'Weight Room', 'scheduled', 'Strength', 'Beginner'],
    ['cls_003', 'Boxing Conditioning', 'emp_004', 'David Chen', 12, 3, 19, 'Studio B', 'scheduled', 'Boxing', 'Advanced'],
    ['cls_004', 'Mobility Flow', 'emp_003', 'Elena Rossi', 20, 4, 8, 'Yoga Room', 'scheduled', 'Mobility', 'All Levels'],
    ['cls_005', 'Weekend Bootcamp', 'emp_002', 'Marcus Thorne', 24, 5, 9, 'Outdoor', 'scheduled', 'Bootcamp', 'Intermediate'],
    ['cls_006', 'Core Power', 'emp_005', 'Hana Kim', 16, -2, 17, 'Studio A', 'completed', 'Core', 'All Levels'],
  ].map(([id, title, trainer_id, trainer_name, capacity, day, hour, room, status, class_type, level]) => ({
    id,
    title,
    trainer_id,
    trainer_name,
    capacity,
    start_time: dateTimeOffset(Number(day), Number(hour), 0),
    end_time: dateTimeOffset(Number(day), Number(hour) + 1, 0),
    room,
    status,
    class_type,
    level,
    branch: 'Main Branch',
    data: mysqlJson({ demo: true }),
  }));

  const legacyClasses = classSessions.map((session) => ({
    id: session.id,
    name: session.title,
    instructor_id: session.trainer_id,
    start_time: session.start_time,
    end_time: session.end_time,
    capacity: session.capacity,
    data: session.data,
  }));

  const classBookings = [];
  for (let i = 1; i <= 24; i += 1) {
    const session = classSessions[(i - 1) % classSessions.length];
    const member = members[(i - 1) % members.length];
    classBookings.push({
      id: `booking_${pad(i)}`,
      class_id: session.id,
      member_id: member.id,
      member_name: `${member.first_name} ${member.last_name}`,
      status: i % 11 === 0 ? 'cancelled' : 'booked',
      booked_at: dateTimeOffset(-7 + (i % 5), 10, i % 60),
      cancelled_at: i % 11 === 0 ? dateTimeOffset(-2, 12, 0) : null,
      data: mysqlJson({ demo: true }),
    });
  }

  const privateSessions = [];
  for (let i = 1; i <= 10; i += 1) {
    const member = members[(i + 2) % members.length];
    const trainer = employees[(i - 1) % 5];
    const status = i <= 4 ? 'completed' : i === 10 ? 'cancelled' : 'scheduled';
    privateSessions.push({
      id: `pt_${pad(i)}`,
      series_id: `pts_${pad(Math.ceil(i / 2))}`,
      member_id: member.id,
      member_name: `${member.first_name} ${member.last_name}`,
      trainer_id: trainer.id,
      trainer_name: `${trainer.first_name} ${trainer.last_name}`,
      start_time: dateTimeOffset(i - 5, 15 + (i % 4), 0),
      end_time: dateTimeOffset(i - 5, 16 + (i % 4), 0),
      room: i % 2 === 0 ? 'PT Room 1' : 'PT Room 2',
      status,
      level: i % 3 === 0 ? 'Advanced' : 'General',
      branch: 'Main Branch',
      notes: status === 'cancelled' ? 'Client rescheduled for next week.' : 'Demo PT scenario.',
      data: mysqlJson({ demo: true, sessionPackage: '10 Pack' }),
    });
  }

  const suppliers = [
    ['sup_001', 'NutriFuel Supplements', 'Sarah Jenkins', 'orders@nutrifuel.demo', '+155530001', 'Net 30', 'Mon/Wed delivery'],
    ['sup_002', 'IronWorks Equipment Co.', 'Marcus Thorne', 'sales@ironworks.demo', '+155530002', '50% deposit / 50% on receipt', 'Monthly freight'],
    ['sup_003', 'Elite Textiles Group', 'Elena Rossi', 'po@elitetextiles.demo', '+155530003', 'Net 15', 'Weekly delivery'],
    ['sup_004', 'Pulse Fitness Tech', 'David Chen', 'supply@pulsefit.demo', '+155530004', 'Net 45', 'Bi-weekly'],
    ['sup_005', 'HydraCore Drinks', 'Nora Wells', 'logistics@hydracore.demo', '+155530005', 'Net 7', 'Tuesday/Friday'],
    ['sup_006', 'GymPro Accessories', 'Leo Martin', 'orders@gympro.demo', '+155530006', 'Net 30', 'On demand'],
  ].map(([id, name, contact_name, email, phone, payment_terms, delivery_schedule]) => ({
    id,
    name,
    contact_name,
    email,
    phone,
    payment_terms,
    delivery_schedule,
    contract_notes: `Demo supplier contract for ${name}.`,
    status: 'active',
    data: mysqlJson({ demo: true, performanceScore: 80 + Math.floor(Math.random() * 15) }),
  }));

  const productSeed = [
    ['SUP-WHEY-ISO-5LB-V', '629100000001', 'Whey Isolate Protein Vanilla 5lb', 'Supplements', 'sup_001', 38.50, 59.99, 51.99, 54.99, 142, 24, 250, 180],
    ['SUP-WHEY-CHOC-5LB', '629100000002', 'Whey Isolate Protein Chocolate 5lb', 'Supplements', 'sup_001', 38.50, 59.99, 51.99, 54.99, 126, 24, 250, 190],
    ['SUP-CREA-MONO-500G', '629100000003', 'Creatine Monohydrate 500g', 'Supplements', 'sup_001', 18.00, 32.50, 28.00, 29.99, 214, 30, 300, 365],
    ['SUP-PRE-XRUSH-30S', '629100000004', 'X-Rush Pre-Workout Blue Razz', 'Supplements', 'sup_001', 21.50, 44.99, 39.99, 40.49, 8, 15, 120, 160],
    ['SUP-BCAA-500', '629100000005', 'BCAA Complex 500g', 'Supplements', 'sup_001', 15.50, 32.99, 27.99, 29.69, 63, 20, 140, 240],
    ['SUP-PBAR-CHOCO', '629100000006', 'Power Bar Chocolate', 'Supplements', 'sup_001', 1.10, 2.99, 2.40, 2.69, 210, 50, 500, 120],
    ['SUP-ELECTRO-BLUE', '629100000007', 'ElectroHydrate Blue', 'Supplements', 'sup_005', 1.20, 4.50, 3.50, 4.05, 156, 30, 300, 100],
    ['SUP-MASS-GAINER-5KG', '629100000008', 'Mass Gainer Ultra 5kg', 'Supplements', 'sup_001', 55.00, 89.00, 78.00, 80.10, 42, 12, 100, 210],
    ['SUP-OMEGA-120', '629100000009', 'Omega 3 Capsules 120ct', 'Supplements', 'sup_001', 9.50, 22.00, 18.00, 19.80, 77, 20, 160, 450],
    ['SUP-VITD-90', '629100000010', 'Vitamin D3 90ct', 'Supplements', 'sup_001', 5.00, 12.50, 10.00, 11.25, 32, 20, 140, 540],
    ['EQ-KETTLE-16KG-P', '629100000011', 'Cast Iron Kettlebell 16kg', 'Equipment', 'sup_002', 24.00, 45.00, 38.00, 45.00, 12, 15, 40, null],
    ['EQ-BARBELL-7FT-OLY', '629100000012', 'Olympic Barbell 20kg Chrome', 'Equipment', 'sup_002', 110.00, 249.99, 210.00, 249.99, 0, 4, 25, null],
    ['EQ-DUMB-PAIR-10KG', '629100000013', 'Rubber Dumbbell Pair 10kg', 'Equipment', 'sup_002', 34.00, 74.99, 62.00, 74.99, 18, 8, 60, null],
    ['EQ-PLATE-20KG', '629100000014', 'Bumper Plate 20kg', 'Equipment', 'sup_002', 28.00, 69.99, 58.00, 69.99, 22, 10, 80, null],
    ['EQ-YOGA-MAT-PRO', '629100000015', 'Premium Yoga Mat', 'Equipment', 'sup_004', 12.00, 29.99, 24.00, 26.99, 74, 20, 160, null],
    ['EQ-FOAM-ROLLER', '629100000016', 'High Density Foam Roller', 'Equipment', 'sup_004', 7.50, 19.99, 16.00, 17.99, 49, 15, 120, null],
    ['EQ-RES-BAND-SET', '629100000017', 'Resistance Band Set', 'Equipment', 'sup_006', 6.20, 18.99, 14.99, 17.09, 98, 25, 220, null],
    ['EQ-LIFT-STRAP-BLK', '629100000018', 'Padded Lifting Straps Black', 'Equipment', 'sup_006', 4.20, 12.99, 9.99, 11.69, 89, 20, 200, null],
    ['EQ-SHAKER-PRO', '629100000019', 'Shaker Bottle Pro Steel Gray', 'Equipment', 'sup_006', 4.00, 12.50, 10.50, 11.25, 84, 30, 240, null],
    ['EQ-GLOVES-GRIP', '629100000020', 'GripMaster Training Gloves', 'Equipment', 'sup_006', 8.00, 19.99, 16.99, 17.99, 14, 18, 180, null],
    ['APP-TEE-COMP-XL', '629100000021', 'Compression Tee XL', 'Apparel', 'sup_003', 16.00, 45.00, 36.00, 40.50, 12, 20, 120, null],
    ['APP-TEE-COMP-M', '629100000022', 'Compression Tee M', 'Apparel', 'sup_003', 16.00, 45.00, 36.00, 40.50, 56, 20, 120, null],
    ['APP-HOODIE-BLK-L', '629100000023', 'PowerGym Hoodie Black L', 'Apparel', 'sup_003', 24.00, 69.00, 56.00, 62.10, 38, 12, 100, null],
    ['APP-SHORTS-BLK-M', '629100000024', 'Training Shorts Black M', 'Apparel', 'sup_003', 13.00, 34.00, 27.00, 30.60, 65, 15, 160, null],
    ['APP-LEGGINGS-M', '629100000025', 'Performance Leggings M', 'Apparel', 'sup_003', 18.50, 49.00, 39.00, 44.10, 48, 15, 140, null],
    ['APP-CAP-GREEN', '629100000026', 'PowerGym Cap Green', 'Apparel', 'sup_003', 5.50, 18.00, 14.00, 16.20, 91, 20, 200, null],
    ['APP-SOCKS-3PK', '629100000027', 'Training Socks 3 Pack', 'Apparel', 'sup_003', 3.50, 11.99, 8.99, 10.79, 134, 30, 300, null],
    ['APP-JACKET-WIND-L', '629100000028', 'Lightweight Wind Jacket L', 'Apparel', 'sup_003', 32.00, 89.00, 72.00, 80.10, 16, 10, 80, null],
    ['APP-TANK-WOMEN-S', '629100000029', 'Women Training Tank S', 'Apparel', 'sup_003', 10.00, 29.00, 22.00, 26.10, 44, 12, 120, null],
    ['APP-DUFFEL-40L', '629100000030', 'Stealth Duffel 40L', 'Apparel', 'sup_003', 29.00, 65.00, 54.00, 58.50, 0, 8, 70, null],
  ];

  const products = productSeed.map((row, index) => {
    const [sku, barcode, name, category, supplier_id, cost_price, retail_price, wholesale_price, member_price, stock_quantity, min_stock, max_stock, expiryDays] = row;
    return {
      id: `prod_${pad(index + 1)}`,
      sku,
      barcode,
      name,
      description: `${name} demo catalog item for Warehouse/POS scenarios.`,
      category,
      supplier_id,
      cost_price,
      retail_price,
      wholesale_price,
      member_price,
      stock_quantity,
      min_stock,
      max_stock,
      unit: 'pcs',
      location: index % 2 === 0 ? 'main' : 'front-store',
      expiry_date: expiryDays ? dateOffset(Number(expiryDays)) : null,
      status: Number(stock_quantity) <= 0 ? 'active' : 'active',
      data: mysqlJson({ demo: true, imageHint: category }),
    };
  });

  const productBatches = products.slice(0, 12).map((product, index) => ({
    id: `batch_${pad(index + 1)}`,
    product_id: product.id,
    batch_number: `BATCH-${pad(index + 1)}`,
    lot_number: `LOT-${pad(index + 5)}`,
    serial_number: null,
    expiry_date: product.expiry_date,
    quantity: Math.max(0, Number(product.stock_quantity)),
    cost_price: product.cost_price,
    status: 'active',
    data: mysqlJson({ demo: true }),
  }));

  const purchaseOrders = [
    ['po_001', 'PO-DEMO-0001', 'sup_002', 'received', -24, -18, -17, 2700, 135, 180],
    ['po_002', 'PO-DEMO-0002', 'sup_001', 'received', -18, -12, -12, 3120, 156, 60],
    ['po_003', 'PO-DEMO-0003', 'sup_003', 'invoiced', -10, 2, null, 8900, 445, 220],
    ['po_004', 'PO-DEMO-0004', 'sup_006', 'pending', -3, 4, null, 1240, 62, 40],
    ['po_005', 'PO-DEMO-0005', 'sup_004', 'shipped', -5, 1, null, 4500, 225, 150],
    ['po_006', 'PO-DEMO-0006', 'sup_005', 'pending', -1, 3, null, 2200, 110, 75],
  ].map(([id, po_number, supplier_id, status, orderOffset, expectedOffset, receivedOffset, subtotal, tax_total, shipping_total]) => ({
    id,
    po_number,
    supplier_id,
    status,
    order_date: dateOffset(Number(orderOffset)),
    expected_date: dateOffset(Number(expectedOffset)),
    received_date: receivedOffset === null ? null : dateOffset(Number(receivedOffset)),
    subtotal,
    tax_total,
    shipping_total,
    total: money(Number(subtotal) + Number(tax_total) + Number(shipping_total)),
    notes: `Demo purchase order ${po_number}.`,
    created_by: 'warehouse.manager@powergym.demo',
    data: mysqlJson({ demo: true }),
  }));

  const poItems = [
    ['poi_001', 'po_001', 'prod_012', 6, 6, 110],
    ['poi_002', 'po_001', 'prod_011', 30, 30, 24],
    ['poi_003', 'po_001', 'prod_013', 20, 20, 34],
    ['poi_004', 'po_002', 'prod_001', 40, 40, 38.5],
    ['poi_005', 'po_002', 'prod_003', 50, 50, 18],
    ['poi_006', 'po_002', 'prod_004', 35, 35, 21.5],
    ['poi_007', 'po_003', 'prod_023', 90, 0, 24],
    ['poi_008', 'po_003', 'prod_028', 80, 0, 32],
    ['poi_009', 'po_004', 'prod_020', 120, 0, 8],
    ['poi_010', 'po_005', 'prod_015', 100, 0, 12],
    ['poi_011', 'po_006', 'prod_007', 200, 0, 1.2],
  ].map(([id, purchase_order_id, product_id, quantity_ordered, quantity_received, unit_cost]) => {
    const product = products.find((item) => item.id === product_id);
    return {
      id,
      purchase_order_id,
      product_id,
      sku: product?.sku ?? '',
      description: product?.name ?? '',
      quantity_ordered,
      quantity_received,
      unit_cost,
      line_total: money(Number(quantity_ordered) * Number(unit_cost)),
      data: mysqlJson({ demo: true }),
    };
  });

  const posSales = [];
  const posItems = [];
  const stockMovements = [];
  const financeTransactions = [];

  purchaseOrders.filter((po) => ['received', 'invoiced'].includes(po.status)).forEach((po, index) => {
    stockMovements.push({
      id: `mov_po_${pad(index + 1)}`,
      product_id: poItems.find((item) => item.purchase_order_id === po.id)?.product_id ?? 'prod_001',
      movement_type: 'purchase_receive',
      quantity_delta: poItems.filter((item) => item.purchase_order_id === po.id).reduce((sum, item) => sum + Number(item.quantity_received), 0),
      unit_cost: poItems.find((item) => item.purchase_order_id === po.id)?.unit_cost ?? 0,
      stock_before: 0,
      stock_after: 0,
      reference_type: 'purchase_order',
      reference_id: po.id,
      reason: `Received ${po.po_number}`,
      performed_by: 'warehouse.manager@powergym.demo',
      data: mysqlJson({ demo: true }),
    });
    financeTransactions.push({
      id: `fin_po_${pad(index + 1)}`,
      type: 'expense',
      category: 'Inventory Purchase',
      amount: po.total,
      transaction_date: po.received_date || po.order_date,
      source: 'warehouse',
      reference_type: 'warehouse_purchase_order',
      reference_id: po.id,
      description: `Inventory purchase ${po.po_number}`,
      status: po.status === 'received' ? 'posted' : 'pending',
      attachment_url: null,
      created_by: 'warehouse.manager@powergym.demo',
      approved_by: po.status === 'received' ? 'accounting@powergym.demo' : null,
      data: mysqlJson({ demo: true }),
    });
  });

  const saleItemSets = [
    [['prod_001', 1], ['prod_004', 1], ['prod_019', 1]],
    [['prod_006', 6], ['prod_007', 2]],
    [['prod_021', 1], ['prod_027', 2]],
    [['prod_003', 1], ['prod_005', 1]],
    [['prod_015', 1], ['prod_016', 1], ['prod_017', 1]],
    [['prod_008', 1]],
    [['prod_022', 2], ['prod_026', 1]],
    [['prod_002', 1], ['prod_006', 3]],
    [['prod_024', 1], ['prod_029', 1]],
    [['prod_018', 2], ['prod_020', 1]],
    [['prod_010', 1], ['prod_009', 1]],
    [['prod_025', 1], ['prod_007', 1]],
  ];

  saleItemSets.forEach((items, saleIndex) => {
    const member = saleIndex % 3 === 0 ? members[saleIndex % members.length] : null;
    const saleId = `sale_${pad(saleIndex + 1)}`;
    let subtotal = 0;
    let cogsTotal = 0;
    items.forEach(([productId, quantity], itemIndex) => {
      const product = products.find((entry) => entry.id === productId);
      const unitPrice = member ? Number(product.member_price || product.retail_price) : Number(product.retail_price);
      const unitCost = Number(product.cost_price);
      const discount = saleIndex % 4 === 0 ? 1.5 : 0;
      const lineTotal = money(Number(quantity) * unitPrice - discount);
      subtotal += lineTotal;
      cogsTotal += Number(quantity) * unitCost;
      posItems.push({
        id: `sale_item_${pad(saleIndex + 1)}_${pad(itemIndex + 1, 2)}`,
        sale_id: saleId,
        product_id: productId,
        sku: product.sku,
        description: product.name,
        quantity,
        unit_price: unitPrice,
        unit_cost: unitCost,
        discount,
        line_total: lineTotal,
        data: mysqlJson({ demo: true }),
      });
      stockMovements.push({
        id: `mov_sale_${pad(saleIndex + 1)}_${pad(itemIndex + 1, 2)}`,
        product_id: productId,
        movement_type: 'sale',
        quantity_delta: -Number(quantity),
        unit_cost: unitCost,
        stock_before: Number(product.stock_quantity) + Number(quantity),
        stock_after: Number(product.stock_quantity),
        reference_type: 'pos_sale',
        reference_id: saleId,
        reason: `POS sale ${saleId}`,
        performed_by: 'cashier@powergym.demo',
        data: mysqlJson({ demo: true }),
      });
    });
    const discountTotal = saleIndex % 5 === 0 ? 5 : 0;
    const taxableBase = Math.max(0, subtotal - discountTotal);
    const taxTotal = money(taxableBase * 0.085);
    const total = money(taxableBase + taxTotal);
    posSales.push({
      id: saleId,
      receipt_number: `POS-DEMO-${pad(saleIndex + 1, 4)}`,
      sale_date: dateTimeOffset(-saleIndex, 13 + (saleIndex % 5), 10),
      status: 'paid',
      cashier: saleIndex % 2 === 0 ? 'cashier@powergym.demo' : 'reception@powergym.demo',
      member_id: member?.id ?? null,
      customer_name: member ? `${member.first_name} ${member.last_name}` : 'Walk-in Customer',
      payment_method: ['cash', 'card', 'digital_wallet'][saleIndex % 3],
      subtotal: money(subtotal),
      discount_total: discountTotal,
      tax_total: taxTotal,
      total,
      cogs_total: money(cogsTotal),
      notes: 'Demo POS sale',
      data: mysqlJson({ demo: true }),
    });
    financeTransactions.push({
      id: `fin_pos_income_${pad(saleIndex + 1)}`,
      type: 'income',
      category: 'POS Sales',
      amount: total,
      transaction_date: dateOffset(-saleIndex),
      source: 'warehouse_pos',
      reference_type: 'warehouse_pos_sale',
      reference_id: saleId,
      description: `POS receipt POS-DEMO-${pad(saleIndex + 1, 4)}`,
      status: 'posted',
      attachment_url: null,
      created_by: 'cashier@powergym.demo',
      approved_by: null,
      data: mysqlJson({ demo: true }),
    });
    financeTransactions.push({
      id: `fin_pos_cogs_${pad(saleIndex + 1)}`,
      type: 'expense',
      category: 'Cost of Goods Sold',
      amount: money(cogsTotal),
      transaction_date: dateOffset(-saleIndex),
      source: 'warehouse_pos',
      reference_type: 'warehouse_pos_cogs',
      reference_id: saleId,
      description: `COGS for POS-DEMO-${pad(saleIndex + 1, 4)}`,
      status: 'posted',
      attachment_url: null,
      created_by: 'system',
      approved_by: 'accounting@powergym.demo',
      data: mysqlJson({ demo: true }),
    });
  });

  invoices.filter((invoice) => invoice.status === 'paid').forEach((invoice, index) => {
    financeTransactions.push({
      id: `fin_member_${pad(index + 1)}`,
      type: 'income',
      category: 'Membership Renewal',
      amount: invoice.total,
      transaction_date: invoice.paid_at ? String(invoice.paid_at).slice(0, 10) : dateOffset(-index),
      source: 'membership',
      reference_type: 'membership_invoice',
      reference_id: invoice.id,
      description: `Membership invoice ${invoice.invoice_number}`,
      status: 'posted',
      attachment_url: null,
      created_by: 'reception@powergym.demo',
      approved_by: null,
      data: mysqlJson({ demo: true }),
    });
  });

  financeTransactions.push(
    { id: 'fin_rent_001', type: 'expense', category: 'Rent', amount: 7500, transaction_date: dateOffset(-8), source: 'finance', reference_type: 'manual', reference_id: 'rent_june', description: 'Main facility rent', status: 'posted', attachment_url: null, created_by: 'accounting@powergym.demo', approved_by: 'manager@powergym.demo', data: mysqlJson({ demo: true }) },
    { id: 'fin_utility_001', type: 'expense', category: 'Utilities', amount: 1280, transaction_date: dateOffset(-6), source: 'finance', reference_type: 'manual', reference_id: 'utilities_june', description: 'Utilities and water', status: 'posted', attachment_url: null, created_by: 'accounting@powergym.demo', approved_by: 'manager@powergym.demo', data: mysqlJson({ demo: true }) },
    { id: 'fin_pt_income_001', type: 'income', category: 'Private Training', amount: 2400, transaction_date: dateOffset(-3), source: 'scheduling', reference_type: 'private_training_package', reference_id: 'pts_001', description: 'Private training package sales', status: 'posted', attachment_url: null, created_by: 'reception@powergym.demo', approved_by: null, data: mysqlJson({ demo: true }) },
    { id: 'fin_payroll_001', type: 'expense', category: 'Payroll', amount: 38500, transaction_date: dateOffset(-2), source: 'hr_payroll', reference_type: 'payroll_run', reference_id: 'payroll_current', description: 'Current month payroll', status: 'posted', attachment_url: null, created_by: 'hr@powergym.demo', approved_by: 'accounting@powergym.demo', data: mysqlJson({ demo: true }) },
  );

  const payrollRun = {
    id: 'payroll_current',
    run_month: monthOffset(0),
    status: 'paid',
    employee_count: employees.length,
    total_base: employees.reduce((sum, employee) => sum + Number(employee.base_salary), 0),
    total_allowances: employees.reduce((sum, employee) => sum + Number(employee.allowance_housing) + Number(employee.allowance_transport) + Number(employee.allowance_medical), 0),
    total_bonuses: 1200,
    total_deductions: employees.reduce((sum, employee) => sum + Number(employee.deduction_tax) + Number(employee.deduction_insurance), 0),
    total_net_pay: 0,
    created_by: 'hr@powergym.demo',
    approved_by: 'manager@powergym.demo',
    paid_at: dateTimeOffset(-2, 11, 0),
  };
  payrollRun.total_net_pay = money(payrollRun.total_base + payrollRun.total_allowances + payrollRun.total_bonuses - payrollRun.total_deductions);

  const payrollItems = employees.map((employee, index) => {
    const allowances = Number(employee.allowance_housing) + Number(employee.allowance_transport) + Number(employee.allowance_medical);
    const bonus = index < 3 ? 200 : 100;
    const deductions = Number(employee.deduction_tax) + Number(employee.deduction_insurance);
    const netPay = money(Number(employee.base_salary) + allowances + bonus - deductions);
    return {
      id: `pay_item_${pad(index + 1)}`,
      payroll_run_id: payrollRun.id,
      employee_id: employee.id,
      employee_name: `${employee.first_name} ${employee.last_name}`,
      department: employee.department,
      base_salary: employee.base_salary,
      allowances,
      bonus,
      deductions,
      attendance_deduction: index === 9 ? 50 : 0,
      net_pay: netPay,
      status: 'paid',
      paid_at: payrollRun.paid_at,
      data: mysqlJson({ demo: true }),
    };
  });

  const attendance = [];
  employees.forEach((employee, empIndex) => {
    for (let day = 1; day <= 5; day += 1) {
      attendance.push({
        id: `att_${pad(empIndex + 1)}_${pad(day, 2)}`,
        employee_id: employee.id,
        employee_name: `${employee.first_name} ${employee.last_name}`,
        work_date: dateOffset(-day),
        check_in: '09:00',
        check_out: employee.department === 'trainer' ? '17:00' : '18:00',
        hours_worked: employee.department === 'trainer' ? 8 : 9,
        status: empIndex === 9 && day === 3 ? 'late' : 'present',
        notes: empIndex === 9 && day === 3 ? 'Arrived late due to traffic.' : 'Demo attendance.',
        data: mysqlJson({ demo: true }),
      });
    }
  });

  const financeBudgets = ['Membership Renewal', 'POS Sales', 'Inventory Purchase', 'Payroll', 'Rent', 'Utilities'].map((category, index) => ({
    id: `budget_${pad(index + 1)}`,
    category,
    budget_month: monthOffset(0),
    monthly_target: [25000, 12000, 8000, 40000, 7500, 1500][index],
  }));

  const financeLoans = [{ id: 'loan_001', lender_name: 'Demo Bank', principal_amount: 50000, interest_rate: 5.5, monthly_payment: 1250, start_date: dateOffset(-365), end_date: dateOffset(730), status: 'active', notes: 'Equipment financing loan.', data: mysqlJson({ demo: true }) }];
  const financeRentals = [{ id: 'rent_001', name: 'Main Facility Lease', monthly_cost: 7500, due_day: 1, start_date: dateOffset(-730), end_date: dateOffset(365), landlord_info: 'Demo Properties LLC', status: 'active', notes: 'Primary gym location.', data: mysqlJson({ demo: true }) }];
  const financeRecurringEntries = [
    { id: 'rec_001', name: 'Facility Rent', type: 'expense', category: 'Rent', amount: 7500, day_of_month: 1, source: 'finance', description: 'Monthly rent', last_processed_month: monthOffset(0), is_active: 1, data: mysqlJson({ demo: true }) },
    { id: 'rec_002', name: 'Software Subscriptions', type: 'expense', category: 'Software', amount: 399, day_of_month: 5, source: 'finance', description: 'Operational software', last_processed_month: monthOffset(-1), is_active: 1, data: mysqlJson({ demo: true }) },
  ];

  const supportTickets = [
    { id: 'ticket_001', ticket_number: 'TCK-DEMO-001', requester_name: 'Alex Rivera', requester_email: 'alex.rivera@demo.powergym.local', requester_phone: '+1555001001', inquiry_type: 'billing', priority: 'high', subject: 'Receipt download request', description: 'Member asked for latest receipt link.', status: 'open', assigned_to: 'support@powergym.demo', created_by: 'reception@powergym.demo', resolved_at: null, data: mysqlJson({ demo: true }) },
    { id: 'ticket_002', ticket_number: 'TCK-DEMO-002', requester_name: 'Maya Chen', requester_email: 'maya.chen@demo.powergym.local', requester_phone: '+1555001002', inquiry_type: 'technical', priority: 'normal', subject: 'QR access question', description: 'Member wants to validate QR e-card.', status: 'resolved', assigned_to: 'support@powergym.demo', created_by: 'support@powergym.demo', resolved_at: dateTimeOffset(-1, 16, 0), data: mysqlJson({ demo: true }) },
  ];
  const supportMessages = [
    { id: 'msg_001', ticket_id: 'ticket_001', author_email: 'support@powergym.demo', author_role: 'support', message: 'We are checking invoice PDF availability.', visibility: 'internal', data: mysqlJson({ demo: true }) },
    { id: 'msg_002', ticket_id: 'ticket_002', author_email: 'support@powergym.demo', author_role: 'support', message: 'QR scanner instructions shared with member.', visibility: 'public', data: mysqlJson({ demo: true }) },
  ];

  const notifications = [
    { id: 'notif_001', user_id: 'user_005', role: 'warehouse_manager', title: 'Low stock alert', body: '4 products are below minimum stock.', type: 'warning', channel: 'in_app', link_url: '/warehouse', read_at: null, expires_at: dateTimeOffset(7, 23, 59), data: mysqlJson({ demo: true }) },
    { id: 'notif_002', user_id: 'user_006', role: 'cashier', title: 'Cash register reconciliation', body: 'Close today\'s POS register before end of shift.', type: 'info', channel: 'in_app', link_url: '/warehouse?tab=pos', read_at: null, expires_at: dateTimeOffset(1, 23, 59), data: mysqlJson({ demo: true }) },
  ];

  const notificationPreferences = users.map((user) => ({
    user_id: user.id,
    in_app_enabled: 1,
    email_enabled: 1,
    whatsapp_enabled: user.role === 'reception' ? 1 : 0,
    class_reminders: 1,
    billing_reminders: 1,
    support_updates: 1,
    data: mysqlJson({ demo: true }),
  }));

  const securityAuditEvents = [
    { request_id: 'demo_req_001', actor_id: 'user_001', actor_email: 'superadmin@powergym.demo', actor_role: 'super_admin', method: 'POST', path: '/api/platform/data-integrity/checks', module: 'platform', action: 'data_integrity_check', status_code: 200, duration_ms: 120, ip_address: '127.0.0.1', user_agent: 'Demo Seeder', severity: 'info', metadata: mysqlJson({ demo: true }) },
    { request_id: 'demo_req_002', actor_id: 'user_005', actor_email: 'warehouse.manager@powergym.demo', actor_role: 'warehouse_manager', method: 'POST', path: '/api/warehouse/pos/sales', module: 'warehouse', action: 'pos_sale', status_code: 201, duration_ms: 95, ip_address: '127.0.0.1', user_agent: 'Demo Seeder', severity: 'info', metadata: mysqlJson({ demo: true }) },
  ];
  const securityEvents = [
    { event_type: 'demo_seed_completed', severity: 'info', actor_email: 'superadmin@powergym.demo', ip_address: '127.0.0.1', details: 'Demo dataset reset completed.', metadata: mysqlJson({ demo: true }) },
    { event_type: 'access_denied_sample', severity: 'warning', actor_email: 'cashier@powergym.demo', ip_address: '127.0.0.1', details: 'Cashier attempted restricted backup action in demo.', metadata: mysqlJson({ demo: true }) },
  ];

  const auditLogs = [
    { action: 'demo_seed_reset', details: 'Database operational tables were reset and seeded with demo scenarios.', performed_by: 'system' },
    { action: 'warehouse_demo_ready', details: 'Warehouse, POS and accounting demo records are available.', performed_by: 'system' },
  ];

  const settings = [
    { id: 'general', data: mysqlJson({ ecardTitle: 'PowerGym QR e-Card', ecardNote: 'Present this QR e-card at reception for access validation.', ecardBackgroundImage: '', demoMode: true }) },
    { id: 'warehouse', data: mysqlJson({ defaultTaxRate: 0.085, lowStockAlerts: true, demoMode: true }) },
  ];
  const appSettings = [{ id: 'general', data: mysqlJson({ appName: 'PowerGym Demo Suite', branch: 'Main Branch', currency: 'USD', demoMode: true }) }];

  const pricingRules = [
    { id: 'price_rule_001', name: 'Elite Member Supplements 10%', product_id: null, category: 'Supplements', price_tier: 'member', discount_type: 'percentage', discount_value: 10, starts_at: dateOffset(-30), ends_at: dateOffset(60), status: 'active', data: mysqlJson({ demo: true }) },
    { id: 'price_rule_002', name: 'Apparel Seasonal Promo', product_id: null, category: 'Apparel', price_tier: 'retail', discount_type: 'percentage', discount_value: 15, starts_at: dateOffset(-10), ends_at: dateOffset(20), status: 'active', data: mysqlJson({ demo: true }) },
  ];

  return {
    defaultPassword: DEFAULT_PASSWORD,
    adminUsers,
    users,
    subscriptionPlans,
    plans,
    members,
    memberSubscriptions,
    legacySubscriptions,
    invoices,
    accessTokens,
    employees,
    staff,
    classSessions,
    legacyClasses,
    classBookings,
    privateSessions,
    suppliers,
    products,
    productBatches,
    purchaseOrders,
    poItems,
    posSales,
    posItems,
    stockMovements,
    financeTransactions,
    payrollRuns: [payrollRun],
    payrollItems,
    attendance,
    financeBudgets,
    financeLoans,
    financeRentals,
    financeRecurringEntries,
    supportTickets,
    supportMessages,
    notifications,
    notificationPreferences,
    securityAuditEvents,
    securityEvents,
    auditLogs,
    settings,
    appSettings,
    pricingRules,
  };
}

async function seed(connection, dataset) {
  const inserted = {};
  inserted.admin_users = await bulkInsert(connection, 'admin_users', ['email', 'password_hash', 'role'], dataset.adminUsers);
  inserted.users = await bulkInsert(connection, 'users', ['id', 'email', 'role', 'data'], dataset.users);
  inserted.subscription_plans = await bulkInsert(connection, 'subscription_plans', ['id', 'name', 'description', 'duration_days', 'price', 'currency', 'status', 'data'], dataset.subscriptionPlans);
  inserted.plans = await bulkInsert(connection, 'plans', ['id', 'name', 'price', 'duration_days', 'status', 'data'], dataset.plans);
  inserted.members = await bulkInsert(connection, 'members', ['id', 'first_name', 'last_name', 'email', 'phone', 'status', 'join_date', 'plan', 'qr_code', 'last_access_at', 'data'], dataset.members);
  inserted.member_subscriptions = await bulkInsert(connection, 'member_subscriptions', ['id', 'member_id', 'plan_id', 'plan_name', 'status', 'start_date', 'end_date', 'price', 'currency', 'data'], dataset.memberSubscriptions);
  inserted.subscriptions = await bulkInsert(connection, 'subscriptions', ['id', 'member_id', 'plan_id', 'start_date', 'end_date', 'status', 'amount', 'data'], dataset.legacySubscriptions);
  inserted.invoices = await bulkInsert(connection, 'invoices', ['id', 'invoice_number', 'member_id', 'subscription_id', 'status', 'subtotal', 'tax_amount', 'total', 'currency', 'due_date', 'paid_at', 'data'], dataset.invoices);
  inserted.access_tokens = await bulkInsert(connection, 'access_tokens', ['id', 'member_id', 'token_hash', 'status', 'expires_at', 'revoked_at', 'data'], dataset.accessTokens);
  inserted.employees = await bulkInsert(connection, 'employees', ['id', 'employee_code', 'first_name', 'last_name', 'email', 'phone', 'department', 'job_title', 'employment_status', 'contract_type', 'hire_date', 'base_salary', 'pay_frequency', 'allowance_housing', 'allowance_transport', 'allowance_medical', 'deduction_tax', 'deduction_insurance', 'vacation_days_remaining', 'data'], dataset.employees);
  inserted.staff = await bulkInsert(connection, 'staff', ['id', 'first_name', 'last_name', 'email', 'role', 'status', 'data'], dataset.staff);
  inserted.class_sessions = await bulkInsert(connection, 'class_sessions', ['id', 'title', 'trainer_id', 'trainer_name', 'capacity', 'start_time', 'end_time', 'room', 'status', 'class_type', 'level', 'branch', 'data'], dataset.classSessions);
  inserted.classes = await bulkInsert(connection, 'classes', ['id', 'name', 'instructor_id', 'start_time', 'end_time', 'capacity', 'data'], dataset.legacyClasses);
  inserted.class_bookings = await bulkInsert(connection, 'class_bookings', ['id', 'class_id', 'member_id', 'member_name', 'status', 'booked_at', 'cancelled_at', 'data'], dataset.classBookings);
  inserted.private_sessions = await bulkInsert(connection, 'private_sessions', ['id', 'series_id', 'member_id', 'member_name', 'trainer_id', 'trainer_name', 'start_time', 'end_time', 'room', 'status', 'level', 'branch', 'notes', 'data'], dataset.privateSessions);
  inserted.employee_attendance = await bulkInsert(connection, 'employee_attendance', ['id', 'employee_id', 'employee_name', 'work_date', 'check_in', 'check_out', 'hours_worked', 'status', 'notes', 'data'], dataset.attendance);
  inserted.payroll_runs = await bulkInsert(connection, 'payroll_runs', ['id', 'run_month', 'status', 'employee_count', 'total_base', 'total_allowances', 'total_bonuses', 'total_deductions', 'total_net_pay', 'created_by', 'approved_by', 'paid_at'], dataset.payrollRuns);
  inserted.payroll_items = await bulkInsert(connection, 'payroll_items', ['id', 'payroll_run_id', 'employee_id', 'employee_name', 'department', 'base_salary', 'allowances', 'bonus', 'deductions', 'attendance_deduction', 'net_pay', 'status', 'paid_at', 'data'], dataset.payrollItems);
  inserted.warehouse_suppliers = await bulkInsert(connection, 'warehouse_suppliers', ['id', 'name', 'contact_name', 'email', 'phone', 'payment_terms', 'delivery_schedule', 'contract_notes', 'status', 'data'], dataset.suppliers);
  inserted.warehouse_products = await bulkInsert(connection, 'warehouse_products', ['id', 'sku', 'barcode', 'name', 'description', 'category', 'supplier_id', 'cost_price', 'retail_price', 'wholesale_price', 'member_price', 'stock_quantity', 'min_stock', 'max_stock', 'unit', 'location', 'expiry_date', 'status', 'data'], dataset.products);
  inserted.warehouse_product_batches = await bulkInsert(connection, 'warehouse_product_batches', ['id', 'product_id', 'batch_number', 'lot_number', 'serial_number', 'expiry_date', 'quantity', 'cost_price', 'status', 'data'], dataset.productBatches);
  inserted.warehouse_purchase_orders = await bulkInsert(connection, 'warehouse_purchase_orders', ['id', 'po_number', 'supplier_id', 'status', 'order_date', 'expected_date', 'received_date', 'subtotal', 'tax_total', 'shipping_total', 'total', 'notes', 'created_by', 'data'], dataset.purchaseOrders);
  inserted.warehouse_purchase_order_items = await bulkInsert(connection, 'warehouse_purchase_order_items', ['id', 'purchase_order_id', 'product_id', 'sku', 'description', 'quantity_ordered', 'quantity_received', 'unit_cost', 'line_total', 'data'], dataset.poItems);
  inserted.warehouse_pos_sales = await bulkInsert(connection, 'warehouse_pos_sales', ['id', 'receipt_number', 'sale_date', 'status', 'cashier', 'member_id', 'customer_name', 'payment_method', 'subtotal', 'discount_total', 'tax_total', 'total', 'cogs_total', 'notes', 'data'], dataset.posSales);
  inserted.warehouse_pos_sale_items = await bulkInsert(connection, 'warehouse_pos_sale_items', ['id', 'sale_id', 'product_id', 'sku', 'description', 'quantity', 'unit_price', 'unit_cost', 'discount', 'line_total', 'data'], dataset.posItems);
  inserted.warehouse_stock_movements = await bulkInsert(connection, 'warehouse_stock_movements', ['id', 'product_id', 'movement_type', 'quantity_delta', 'unit_cost', 'stock_before', 'stock_after', 'reference_type', 'reference_id', 'reason', 'performed_by', 'data'], dataset.stockMovements);
  inserted.warehouse_pricing_rules = await bulkInsert(connection, 'warehouse_pricing_rules', ['id', 'name', 'product_id', 'category', 'price_tier', 'discount_type', 'discount_value', 'starts_at', 'ends_at', 'status', 'data'], dataset.pricingRules);
  inserted.finance_transactions = await bulkInsert(connection, 'finance_transactions', ['id', 'type', 'category', 'amount', 'transaction_date', 'source', 'reference_type', 'reference_id', 'description', 'status', 'attachment_url', 'created_by', 'approved_by', 'data'], dataset.financeTransactions);
  inserted.finance_budgets = await bulkInsert(connection, 'finance_budgets', ['id', 'category', 'budget_month', 'monthly_target'], dataset.financeBudgets);
  inserted.finance_loans = await bulkInsert(connection, 'finance_loans', ['id', 'lender_name', 'principal_amount', 'interest_rate', 'monthly_payment', 'start_date', 'end_date', 'status', 'notes', 'data'], dataset.financeLoans);
  inserted.finance_rentals = await bulkInsert(connection, 'finance_rentals', ['id', 'name', 'monthly_cost', 'due_day', 'start_date', 'end_date', 'landlord_info', 'status', 'notes', 'data'], dataset.financeRentals);
  inserted.finance_recurring_entries = await bulkInsert(connection, 'finance_recurring_entries', ['id', 'name', 'type', 'category', 'amount', 'day_of_month', 'source', 'description', 'last_processed_month', 'is_active', 'data'], dataset.financeRecurringEntries);
  inserted.support_tickets = await bulkInsert(connection, 'support_tickets', ['id', 'ticket_number', 'requester_name', 'requester_email', 'requester_phone', 'inquiry_type', 'priority', 'subject', 'description', 'status', 'assigned_to', 'created_by', 'resolved_at', 'data'], dataset.supportTickets);
  inserted.support_ticket_messages = await bulkInsert(connection, 'support_ticket_messages', ['id', 'ticket_id', 'author_email', 'author_role', 'message', 'visibility', 'data'], dataset.supportMessages);
  inserted.notifications = await bulkInsert(connection, 'notifications', ['id', 'user_id', 'role', 'title', 'body', 'type', 'channel', 'link_url', 'read_at', 'expires_at', 'data'], dataset.notifications);
  inserted.notification_preferences = await bulkInsert(connection, 'notification_preferences', ['user_id', 'in_app_enabled', 'email_enabled', 'whatsapp_enabled', 'class_reminders', 'billing_reminders', 'support_updates', 'data'], dataset.notificationPreferences);
  inserted.security_audit_events = await bulkInsert(connection, 'security_audit_events', ['request_id', 'actor_id', 'actor_email', 'actor_role', 'method', 'path', 'module', 'action', 'status_code', 'duration_ms', 'ip_address', 'user_agent', 'severity', 'metadata'], dataset.securityAuditEvents);
  inserted.security_events = await bulkInsert(connection, 'security_events', ['event_type', 'severity', 'actor_email', 'ip_address', 'details', 'metadata'], dataset.securityEvents);
  inserted.audit_logs = await bulkInsert(connection, 'audit_logs', ['action', 'details', 'performed_by'], dataset.auditLogs);
  inserted.settings = await bulkInsert(connection, 'settings', ['id', 'data'], dataset.settings);
  if (await tableExists(connection, 'appSettings')) inserted.appSettings = await bulkInsert(connection, 'appSettings', ['id', 'data'], dataset.appSettings);
  return inserted;
}

const RESET_TABLES = [
  'ecard_delivery_logs',
  'password_reset_tokens',
  'data_integrity_runs',
  'warehouse_pricing_rules',
  'warehouse_pos_sale_items',
  'warehouse_pos_sales',
  'warehouse_purchase_order_items',
  'warehouse_purchase_orders',
  'warehouse_stock_movements',
  'warehouse_product_batches',
  'warehouse_products',
  'warehouse_suppliers',
  'notification_preferences',
  'notifications',
  'support_ticket_messages',
  'support_tickets',
  'security_audit_events',
  'security_events',
  'finance_recurring_entries',
  'finance_budgets',
  'finance_rentals',
  'finance_loans',
  'finance_transactions',
  'payroll_items',
  'payroll_runs',
  'employee_attendance',
  'private_sessions',
  'class_bookings',
  'classes',
  'class_sessions',
  'invoices',
  'access_tokens',
  'member_subscriptions',
  'subscriptions',
  'members',
  'plans',
  'subscription_plans',
  'staff',
  'employees',
  'users',
  'admin_users',
  'accounting',
  'hr',
  'audit_logs',
  'settings',
  'appSettings',
  'shifts',
  'hr_profiles',
  'deployment_checklist',
];

async function main() {
  const args = parseArgs();
  if (args.confirm !== CONFIRMATION) {
    console.error(`Refusing to reset demo data. Re-run with --confirm=${CONFIRMATION}`);
    process.exit(1);
  }
  if (process.env.NODE_ENV === 'production' && !args.allowProduction) {
    console.error('Refusing to reset data while NODE_ENV=production. Add --allow-production only for a controlled demo reset.');
    process.exit(1);
  }

  const dbConfig = getDatabaseEnv();
  const missing = getMissingDatabaseEnv(dbConfig);
  if (missing.length > 0) {
    console.error(`Missing database environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  if (args.migrate) {
    console.log('Applying migrations before demo reset...');
    await runMigrations();
  }

  const dataset = buildDemoDataset();
  if (args.dryRun) {
    const counts = Object.fromEntries(Object.entries(dataset).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, value.length]));
    const output = { mode: 'dry-run', database: `${dbConfig.database}@${dbConfig.host}:${dbConfig.port}`, defaultPassword: dataset.defaultPassword, counts };
    console.log(args.json ? JSON.stringify(output, null, 2) : output);
    return;
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

  const truncated = [];
  try {
    console.log(`Resetting demo data in ${dbConfig.database}@${dbConfig.host}:${dbConfig.port}...`);
    await ensureDemoSchemaCompatibility(connection);
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of RESET_TABLES) {
      if (await truncateIfExists(connection, table)) truncated.push(table);
    }
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');

    await connection.beginTransaction();
    const inserted = await seed(connection, dataset);
    await connection.commit();

    const summary = {
      database: `${dbConfig.database}@${dbConfig.host}:${dbConfig.port}`,
      truncatedTables: truncated.length,
      inserted,
      demoLogins: dataset.adminUsers.map((user) => ({ email: user.email, role: user.role })),
      defaultPassword: dataset.defaultPassword,
      scenarios: {
        members: '20 members with active, expired, paused and pending scenarios',
        employees: '10 employees including 5 trainers',
        privateTraining: '10 PT sessions',
        warehouse: '30 products across Supplements, Equipment and Apparel',
        accounting: 'Membership, POS, COGS, inventory purchases, payroll, rent and utilities',
      },
    };
    console.log(args.json ? JSON.stringify(summary, null, 2) : `Demo dataset ready. Inserted ${Object.values(inserted).reduce((sum, count) => sum + Number(count || 0), 0)} records. Default password: ${dataset.defaultPassword}`);
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    await connection.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => undefined);
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
