# Delivery 17 - Render Low-Memory Build Fix

## Problem

Render successfully installs dependencies and validates the lockfile, but the Vite production build can exceed the available build memory on low-memory Render instances and fail with:

```txt
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

## Fix

This delivery keeps the normal local Vite build unchanged, but changes the Render-specific build path to a lightweight esbuild browser bundle.

### Local development remains unchanged

```bash
npm run dev
npm run build
```

### Render uses the low-memory build

```bash
npm run render:build
```

This command now runs:

```bash
npm run lockfile:check && npm ci --include=dev --registry=https://registry.npmjs.org/ --replace-registry-host=always && npm run build:render
```

`build:render` now executes:

```bash
node scripts/build-render-lite.mjs
```

## Files Added

- `scripts/build-render-lite.mjs`
- `src/main.render.tsx`
- `docs/DELIVERY_17_RENDER_LOW_MEMORY_BUILD_FIX.md`

## Render Settings

Use these Render dashboard settings:

```txt
Build Command:
npm run render:build && npm run render:predeploy
```

```txt
Start Command:
npm run render:start
```

Do not use `npm run dev` or `npm run build` as the Render start command.

## Notes

- The standard Vite build is still available for local/stronger environments.
- The Render build writes `dist/index.html`, `dist/assets/app.js`, and `dist/server.cjs`.
- The Render HTML includes Tailwind CDN fallback styling to avoid running the memory-heavy Tailwind/Vite pipeline during deployment.
