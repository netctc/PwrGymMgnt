# Delivery 5 - HR & Payroll Integration

## Scope

This delivery implements the HR and payroll foundation from the PowerGym Management roadmap. It moves the HR screen away from Firebase-only operations and connects it to protected Node.js/MySQL APIs.

## Implemented files

- `server/hrPayroll.ts`
- `sql/004_hr_payroll_schema.sql`
- `src/lib/hrPayrollApi.ts`
- `src/pages/HumanResources.tsx`
- `server.ts`
- `README.md`
- `docs/verification/verify_delivery5.log`
- `docs/verification/audit_delivery5.log`
- `docs/verification/health_delivery5.json`
- `docs/verification/hr_unauth_delivery5.json`
- `docs/verification/hr_unauth_delivery5.status`
- `docs/verification/server-smoke-delivery5.log`

## Database additions

The new migration adds these tables:

1. `employees`
   - Employee identity and employment profile.
   - Contract type, department, status, hire date, salary, allowances, deductions, and vacation balance.

2. `employee_attendance`
   - Daily attendance per employee.
   - Supports present, absent, paid leave, and unpaid leave.
   - Uses a unique employee/date key to avoid duplicate attendance entries.

3. `payroll_runs`
   - Monthly payroll header.
   - Stores status, employee count, payroll totals, creator, approver, and paid timestamp.

4. `payroll_items`
   - Employee-level payroll line items.
   - Stores base salary, allowances, bonus, deductions, attendance deduction, and net pay.

## Backend APIs

All routes require an authenticated session. HR routes require one of these roles:

- `super_admin`
- `admin`
- `hr`
- `accounting`
- `manager`

Payroll approval and paid-state changes are limited to:

- `super_admin`
- `admin`
- `accounting`
- `manager`

### Employee APIs

```txt
GET  /api/hr/employees
POST /api/hr/employees
PUT  /api/hr/employees/:id
```

### Attendance APIs

```txt
GET  /api/hr/attendance
POST /api/hr/attendance
```

### Payroll APIs

```txt
GET  /api/hr/payroll/runs
POST /api/hr/payroll/runs
GET  /api/hr/payroll/runs/:id
POST /api/hr/payroll/runs/:id/approve
POST /api/hr/payroll/runs/:id/mark-paid
GET  /api/hr/payroll/history
```

## Frontend implementation

The `HumanResources.tsx` screen now supports:

- Employee directory.
- Employee creation and editing.
- Salary, allowance, and deduction setup.
- Employment status and contract type management.
- Attendance capture.
- Monthly payroll generation.
- Payroll run review.
- Payroll approval.
- Mark payroll as paid.
- Summary cards for employee count, average salary, monthly payroll, and run count.

## Payroll calculation logic

For each active employee, the payroll engine calculates:

```txt
net pay = base salary + allowances + bonus - deductions
```

Where:

```txt
allowances = housing allowance + transport allowance + medical allowance
fixed deductions = tax deduction + insurance deduction + additional run deduction
attendance deduction = absent/unpaid leave days * (base salary / 30)
```

## Commands

Install exactly from the lock file:

```cmd
npm ci
```

Verify TypeScript and production build:

```cmd
npm run verify
```

Check dependency security:

```cmd
npm audit
```

Apply all database migrations:

```cmd
npm run db:migrate
```

Run the app:

```cmd
npm run dev
```

## Verification results

Completed successfully:

```cmd
npm run verify
npm audit
```

Results:

```txt
TypeScript check passed
Production build passed
npm audit: found 0 vulnerabilities
```

Smoke test:

```txt
GET /api/health returned 200
GET /api/hr/employees without login returned 401 Authentication required
```

## Notes and limitations

- Payroll generation currently creates one monthly run per `YYYY-MM` value. Regeneration is supported by the frontend through `replaceExisting: true`.
- Payroll integration into accounting ledger posting is planned for the next accounting/finance delivery.
- Employee document upload is not included in this delivery; the database shape allows storing extra metadata through the `data` JSON column later.
- Exportable payroll PDF/Excel reports should be handled in the reporting/accounting delivery to avoid duplicating export logic.
