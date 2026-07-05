# Delivery 14 - Render Lockfile Registry Fix

## Problem

Render was correctly using Node 22.22.0, but `npm ci` still attempted to download `qs` from an internal OpenAI artifact registry:

```txt
https://packages.applied-caas-gateway1.internal.api.openai.org/artifactory/api/npm/npm-public/qs/-/qs-6.15.2.tgz
```

This happens when `package-lock.json` contains a committed `resolved` URL from a private/internal registry. `npm ci` respects the lockfile and may try that URL even when the command includes `--registry=https://registry.npmjs.org/`.

## Fixes Applied

- Replaced the internal `qs` tarball URL in `package-lock.json` with the public npm URL.
- Added `.npmrc` setting:

```txt
replace-registry-host=always
```

- Added lockfile validation script:

```txt
scripts/validate-public-registry.mjs
```

- Added npm script:

```txt
npm run lockfile:check
```

- Updated Render build script:

```txt
npm run lockfile:check && npm ci --include=dev --registry=https://registry.npmjs.org/ --replace-registry-host=always && npm run build
```

## Required Render Settings

Build Command:

```bash
npm run render:build
```

Pre-Deploy Command:

```bash
npm run db:diagnose && npm run db:migrate && npm run db:verify
```

Start Command:

```bash
npm start
```

Do not run `npm run dev` on Render. Do not run `npm run db:seed` automatically on each deploy.

## Local Check Before Pushing

```bash
npm run lockfile:check
npm ci
npm run build
```

## Important

Render deploys the GitHub repository, not the ZIP file. Copy this package into the repository, commit it, and push to `main` before redeploying.
