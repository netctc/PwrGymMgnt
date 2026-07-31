# PowerGym P1 operational validation

Branch: `PwrGymCodex`  
Introduced: 2026-07-30

P0 is accepted after the production-like release gate and isolated restore
rehearsal both report `Posture: pass`.

## Database concurrency

The application uses transactions and `SELECT ... FOR UPDATE` around subscription
renewals, payment changes, trainer commission settlement and session balance
movements. The P1 concurrency command verifies those protections against the
configured MySQL database without modifying rows:

```bash
npm run ops:concurrency-verify -- --rehearsal
```

The command:

1. Selects one existing fixture from each critical table.
2. Opens two independent transactions.
3. Locks the fixture in the first transaction.
4. verifies that the second transaction receives MySQL lock timeout 1205.
5. Rolls back both transactions.
6. Writes sanitized evidence under `release-evidence/`.

Run it against staging or a restored rehearsal database, not during a busy
production window. All four checks must pass. A missing fixture is a blocker
because no real concurrency behaviour was exercised.
`--rehearsal` reads only the dedicated `REHEARSAL_DATABASE_*` variables.

## Remaining P1 evidence

- Validate Windows scheduled tasks and Linux systemd units on their real hosts.
- Reconcile opening accounting balances with the approved accounting statement.
- Reconcile product quantities with a signed physical stock count.
- Approve and execute the audit-log, notification and backup retention policy.

None of these items should be marked complete from static code review alone.

## Windows and Linux services

Run the non-mutating service check on each installed host:

```bash
npm run ops:service-verify -- -w --base-url=http://server-ip:3000
npm run ops:service-verify -- -l --base-url=https://your-domain.example
```

If the Windows tasks exist but remain queued and `logs\service.log` is not
created, repair only the scheduled-task registration without reinstalling
dependencies or changing the database. Run the command from an elevated
Command Prompt so Windows can replace tasks that were created by an
administrator:

```bat
npm run ops:service-repair:windows
timeout /t 10 /nobreak
npm run ops:service-verify -- -w --base-url=http://server-ip:3000
```

The repair registers `node.exe` as the executable (without embedded quotes),
passes the runner as a separate argument, assigns the project working
directory, enables restart supervision and starts `PowerGym`. It safely
replaces the two existing task definitions.

Windows validates the `PowerGym` and `PowerGym-Health` scheduled tasks. Linux
validates the system-level `powergym.service` and `powergym-health.timer`. Both
checks also require HTTP 200 from `/api/health` and write platform-specific JSON
evidence.

On Linux, application setup runs as the normal deployment account. Service
registration elevates only the unit installation through `sudo`, and the units
continue to execute as that non-root account. This avoids root-owned project
files and does not depend on an interactive login or user-session lingering.
The units use absolute quoted paths, wait for network and MySQL, restart the
application automatically, and run the health monitor every five minutes.
When installation is launched by root on a dedicated server, the registrator
creates a locked `powergym` system account if needed. Only `.env` and the
runtime directories `logs`, `backups` and `release-evidence` are assigned to
that account; the service never runs as root.

## Accounting and physical stock reconciliation

Create a controlled count template from the current ledger and product catalogue:

```bash
npm run ops:reconcile -- --write-template=reconciliation/go-live-baseline.json
```

The generated values are starting points, not approval. Finance must replace
`approvedLedgerBalance` with the signed accounting balance and warehouse staff
must replace every product quantity with the signed physical count. Then run:

```bash
npm run ops:reconcile -- --input=reconciliation/go-live-baseline.json
```

The command is read-only. It blocks negative stock, differences from the latest
stock movement, accounting differences, missing physical counts and quantity
differences. When stock differs from its latest movement, the diagnostic lists
the SKU, product name, system quantity, latest movement quantity and movement
timestamp so the discrepancy can be investigated without exposing technical
identifiers. Technical identifiers are omitted from evidence.

Migration `029_demo_stock_ledger_baseline.sql` corrects only the known
`APP-HOODIE-BLK-L` demo signature created by the original complete-demo reset:
product `prod_023`, demo marker enabled, system quantity 38 and latest movement
`mov_po_003` with zero delta and zero final stock. It appends an immutable
reconciliation checkpoint and audit entry; it does not update the product,
delete history or affect products that do not match every guard.

## Retention policy

The default policy retains application and security audit data for 730 days,
closed or expired notifications for 90 days and managed backups for 30 days.
Financial transactions, invoices, commissions, session movements and warehouse
stock movements are explicitly protected from this cleanup.

Managed `.sql` backups are inspected in preview mode. Empty files and valid
backups older than the configured period are candidates. Apply mode moves these
files into a timestamped `backups/quarantine/` directory instead of deleting
them, preserving a recoverable trail while removing invalid or expired files
from the operational backup catalogue.

Preview candidate rows:

```bash
npm run ops:retention
```

After management or compliance approval, apply the configured policy:

```bash
npm run ops:retention -- --apply --confirm=APPLY_RETENTION
```

Application is transactional and writes an audit entry. The retention periods can
be increased with `AUDIT_LOG_RETENTION_DAYS`,
`SECURITY_AUDIT_RETENTION_DAYS`, `NOTIFICATION_RETENTION_DAYS` and
`DATABASE_BACKUP_RETENTION_DAYS`. The enforced minimums cannot be reduced by
configuration.
