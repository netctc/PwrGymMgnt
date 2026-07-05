# Delivery 6 - Accounting & Finance Integration

## Scope

This delivery implements the accounting and finance foundation on top of Delivery 5. It introduces a protected `/api/finance` backend module, a normalized MySQL migration, a frontend API wrapper, and a rebuilt Accounting screen that uses the backend instead of direct Firestore access.

## Implemented files

- `server/finance.ts`
- `src/lib/financeApi.ts`
- `src/pages/Accounting.tsx`
- `sql/005_finance_accounting_schema.sql`
- `server.ts`
- `src/App.tsx`
- `README.md`

## Database additions

The new migration creates these tables:

- `finance_transactions`
- `finance_loans`
- `finance_rentals`
- `finance_budgets`
- `finance_recurring_entries`

The transaction table includes indexes for date, type, category, and status. It also includes a unique `(reference_type, reference_id)` key to prevent duplicate postings from payroll or recurring entries.

## Backend capabilities

### Summary and dashboard

- Period-based finance summary.
- Total income, expense, and net profit.
- Category breakdown.
- Monthly trend data.
- Active loan and rental totals.

### Ledger transactions

- List/filter transactions.
- Create income, expense, and transfer transactions.
- Update transactions.
- Approve transactions.
- Delete transactions.

### Loans and rentals

- List and create loans.
- Update loan details and status.
- List and create rentals.
- Update rental details and status.

### Budgets

- Create or update monthly category budgets.
- Compare budget target against actual expense transactions.

### Payroll posting

- Posts approved or paid HR payroll runs as accounting expense transactions.
- Prevents duplicate payroll postings by using `reference_type = 'payroll_run'` and `reference_id = payroll_run_id`.

### Recurring processing

- Processes enabled recurring finance entries for the selected/current month.
- Prevents duplicate recurring postings using reference IDs.

## Frontend capabilities

The Accounting screen now includes:

- Date/type filters.
- Dashboard KPI cards.
- Manual transaction entry.
- Ledger table.
- CSV export.
- XLSX export through the internal safe exporter.
- PDF financial summary export.
- Payroll run posting.
- Loan entry and list.
- Rental entry and list.
- Budget entry and variance table.
- Category and monthly analytics tables.

## Security

All `/api/finance` routes require an authenticated session and one of these roles:

- `super_admin`
- `admin`
- `accounting`
- `manager`

The frontend route allows `admin` and `accounting` profiles to access the Accounting screen.

## Verification

Executed successfully:

```cmd
npm run verify
npm audit
```

Result:

```txt
TypeScript passed
Production build passed
npm audit: found 0 vulnerabilities
```

Smoke-tested:

```txt
/api/health: ok
/api/finance/summary without login: 401 Authentication required
```

## Notes

This delivery provides the accounting foundation and UI integration. A future delivery can add richer approval workflows, chart visualizations, multi-currency support, tax configuration, and automatic invoice/payment synchronization from the membership module.
