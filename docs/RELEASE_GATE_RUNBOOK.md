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

## Authenticated database smoke

The application login uses an HttpOnly session cookie. For an authenticated
`db-health` check, configure credentials only in the local/host environment:

```txt
DEPLOY_SMOKE_LOGIN_EMAIL=admin@powergym.local
DEPLOY_SMOKE_LOGIN_PASSWORD=<current-password>
```

Then run:

```bash
npm run ops:release-gate -- --skip-code --skip-database --base-url=https://your-domain.example --include-db-smoke
```

The smoke process logs in through `/api/auth/login`, keeps the session cookie in
memory and redacts it from evidence. Never pass the password as a command-line
argument or commit it to source control. `DEPLOY_SMOKE_AUTH_TOKEN` remains
supported for environments that issue dedicated bearer tokens.

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

Restore rehearsal remains a separate controlled operation because it requires an
isolated MySQL database. The automation never creates or drops a database and
never reads the normal application credentials as its rehearsal target.

Create the isolated database and a dedicated MySQL account first. Its database
name must contain `rehearsal`, `restore`, `sandbox`, `staging` or `test`, and it
must differ from the configured application database.

Configure these variables locally:

```txt
REHEARSAL_DATABASE_HOSTNAME=localhost
REHEARSAL_DATABASE_PORT=3306
REHEARSAL_DATABASE_USER_NAME=powergym_rehearsal
REHEARSAL_DATABASE_PASSWORD=<dedicated-password>
REHEARSAL_DATABASE_NAME=powergym_restore_test
```

List managed backups, preview the complete plan and then execute it:

```bash
npm run db:restore -- --list
npm run ops:restore-rehearsal -- --backup=<managed-backup.sql> --dry-run
npm run ops:restore-rehearsal -- --backup=<managed-backup.sql> --confirm=RESTORE_REHEARSAL
```

The protected workflow executes, in order:

1. Backup inspection and checksum verification.
2. Restore into the isolated target.
3. Transactional database-access verification.
4. Database-integrity verification.

It writes a sanitized JSON file under `release-evidence/`. Passwords are not
written to evidence. A missing variable, unsafe database name, production target,
invalid backup, failed restore or failed verification blocks acceptance.
