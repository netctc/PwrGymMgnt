# Delivery 13 - Render Deployment Fix

## Problem observed on Render

The Render build command was configured as:

```bash
npm ci; npm run db:diagnose; npm run db:migrate; npm run db:verify; npm run db:seed; npm run dev;
```

This is unsafe for production because semicolons continue execution even if `npm ci` fails. The log showed `npm ci` timed out, then the next commands still ran without installed dependencies, causing missing `mysql2` and missing `tsx` errors.

The build also used `npm run dev`, which is a local development command. Render should start the compiled production server with `npm start`.

## Changes made

- Added `.npmrc` to force the public npm registry.
- Added `.node-version` pinned to Node 22.
- Added `engines` in `package.json` with an upper bound to avoid unexpected Node major upgrades.
- Added Render-specific scripts:
  - `render:build`
  - `render:predeploy`
  - `render:start`
- Added `render.yaml` with production-ready Render settings:
  - build command installs dependencies and builds the app
  - pre-deploy command runs DB diagnose/migrate/verify
  - start command uses `npm start`
  - health check path uses `/api/health`
- Updated README with Render deployment instructions.

## Correct Render settings if configuring manually

Build Command:

```bash
npm ci --include=dev --registry=https://registry.npmjs.org/ && npm run build
```

Pre-Deploy Command:

```bash
npm run db:diagnose && npm run db:migrate && npm run db:verify
```

Start Command:

```bash
npm start
```

Do not run `npm run dev` on Render.
Do not run `npm run db:seed` automatically on every production deploy. Run it once manually only for a demo environment.

## Required Render environment variables

Set these in Render Dashboard > Environment:

```env
NODE_VERSION=22.22.0
NODE_ENV=production
NPM_CONFIG_REGISTRY=https://registry.npmjs.org/
DATABASE_HOSTNAME=your_mysql_host
DATABASE_PORT=3306
DATABASE_USER_NAME=your_mysql_user
DATABASE_PASSWORD=your_mysql_password
DATABASE_NAME=your_mysql_database
JWT_SECRET=your_long_random_secret
ADMIN_EMAIL=your_admin_email
ADMIN_PASSWORD=your_initial_admin_password
ADMIN_SETUP_TOKEN=your_setup_token
CORS_ORIGIN=https://your-render-service.onrender.com
```
