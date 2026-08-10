# Delivery 6 — V2 Session-Balance Reconciliation

This increment adds a read-only gate for the migrated V2 session ledger. Legacy `member_subscriptions` does not contain an authoritative session balance, so the verifier never invents a legacy-to-V2 numeric comparison.

It checks active-cycle coverage for limited plans, expected balance contexts for shared and individual distributions, absence of balances for unlimited plans, ledger-to-projection equality, the materialized `available` formula, non-negative counters, and orphan movements.

Run:

```cmd
npm run db:reconcile-v2-session-balances -- --output=release-evidence/v2-session-balance-reconciliation.json
```

The command never writes to the database. A `PASS` clears only the `sessionBalances` scope; `accessDecisions` remains required before shadow mode or cutover.
