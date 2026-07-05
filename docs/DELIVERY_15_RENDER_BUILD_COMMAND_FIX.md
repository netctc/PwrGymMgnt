# Delivery 15 - Render Build Command Fix

## Issue

Render was configured with this build command:

```bash
npm run build
```

That command runs Vite and esbuild, but Render had not installed project dependencies first. The build failed with:

```text
sh: 1: vite: not found
```

This is a deployment configuration issue, not an application code issue.

## Fixes Added

1. Added `scripts/ensure-build-deps.mjs`.
   - Checks whether `node_modules/.bin/vite` and `node_modules/.bin/esbuild` exist.
   - If they are missing, it runs:
     ```bash
     npm ci --include=dev --registry=https://registry.npmjs.org/ --replace-registry-host=always
     ```

2. Added a `prebuild` script so `npm run build` becomes self-healing on Render.

3. Updated `render:build` to:
   ```bash
   npm run lockfile:check && npm ci --include=dev --registry=https://registry.npmjs.org/ --replace-registry-host=always && npm run build
   ```

4. Updated `render.yaml` to use:
   ```yaml
   buildCommand: npm run render:build
   startCommand: npm run render:start
   ```

## Recommended Render Settings

Build Command:

```bash
npm run render:build
```

Pre-Deploy Command:

```bash
npm run render:predeploy
```

Start Command:

```bash
npm run render:start
```

## Emergency Fallback

If the Render dashboard still contains `npm run build`, this package will still install dependencies automatically through `prebuild` before Vite runs.

However, the recommended configuration remains `npm run render:build`.
