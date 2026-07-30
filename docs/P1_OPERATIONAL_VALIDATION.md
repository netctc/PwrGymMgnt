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
npm run ops:concurrency-verify
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

## Remaining P1 evidence

- Validate Windows scheduled tasks and Linux systemd units on their real hosts.
- Reconcile opening accounting balances with the approved accounting statement.
- Reconcile product quantities with a signed physical stock count.
- Approve and execute the audit-log, notification and backup retention policy.

None of these items should be marked complete from static code review alone.
