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

## Retention policy

The default policy retains application and security audit data for 730 days,
closed or expired notifications for 90 days and managed backups for 30 days.
Financial transactions, invoices, commissions, session movements and warehouse
stock movements are explicitly protected from this cleanup.

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
