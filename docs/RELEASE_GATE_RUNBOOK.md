# PowerGym release gate

Date introduced: 2026-07-30  
Branch: `PwrGymCodex`

The release gate turns the P0 production checks into one ordered, fail-fast workflow. It records a JSON evidence file for every attempted release and never restores or deletes data.

## Default order

1. Clean-checkout verification.
2. `verify:ci`, including the structural maintenance audit.
3. Database backup.
4. Ordered migrations.
5. Transactional database access verification.
6. Data-integrity checks.
7. External smoke checks against the final domain or IP.

Any failed step blocks the remaining steps and writes the evidence collected so far.

## Production-like execution

Configure the database and final external URL through the environment, then run:

```bash
npm ci
npm run ops:release-gate -- --base-url=https://your-domain.example --include-db-smoke
```

Windows Command Prompt:

```bat
set DEPLOY_BASE_URL=https://your-domain.example
npm run ops:release-gate -- --include-db-smoke
```

Linux:

```bash
DEPLOY_BASE_URL=https://your-domain.example npm run ops:release-gate -- --include-db-smoke
```

Evidence is written under `release-evidence/`. Keep the JSON file together with the SQL backup checksum, deployment identifier and approval record.

## Safe preview

The preview validates the plan without running tests, migrations, backups or HTTP requests:

```bash
npm run ops:release-gate -- --dry-run --base-url=https://your-domain.example
```

## Explicit exceptions

These flags are exceptions and must be documented in the change record:

- `--skip-code`
- `--skip-database`
- `--skip-smoke`
- `--allow-dirty`

There is no implicit smoke-test skip. A final URL is mandatory unless `--skip-smoke` is explicitly supplied.

## Restore rehearsal

Restore rehearsal remains a separate controlled operation because it requires an isolated, disposable MySQL database. Never point it at the production database.

1. Create an isolated rehearsal database.
2. Configure the database variables for that database only.
3. Inspect the selected backup.
4. Apply the restore with the existing protected restore command.
5. Run `db:verify` and `db:integrity`.
6. Record the backup SHA-256 and evidence in the release record.

```bash
npm run db:restore -- --backup=<backup.sql> --inspect --json
npm run db:restore -- --backup=<backup.sql> --apply --confirm=RESTORE --allow-destructive
npm run db:verify
npm run db:integrity -- --json
```

The rehearsal is accepted only when the target database is demonstrably different from production and all verification steps pass.
