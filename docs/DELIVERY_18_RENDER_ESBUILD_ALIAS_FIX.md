# Delivery 18 - Render Esbuild Alias Resolver Fix

## Problem

Render low-memory deployment reached the custom esbuild build step, but failed on extensionless Vite-style aliases such as:

```txt
@/lib/utils
@/components/ui/button
```

The Render-only esbuild resolver mapped `@/path` directly to `src/path` without trying TypeScript/React file extensions. Vite resolves these automatically, but custom esbuild plugins must implement that behavior explicitly.

## Fix

Updated `scripts/build-render-lite.mjs` with a Vite-like resolver that checks:

- exact path
- `.ts`
- `.tsx`
- `.js`
- `.jsx`
- `.mjs`
- `.cjs`
- `.json`
- directory `index.ts`, `index.tsx`, `index.js`, `index.jsx`, `index.mjs`, `index.cjs`

This keeps the normal local Vite build unchanged while making the Render low-memory esbuild build compatible with the existing app imports.

## Render commands

Use these commands in Render:

```txt
Build Command:
npm run render:build && npm run render:predeploy
```

```txt
Start Command:
npm run render:start
```

Do not use `npm run build` on Render Free/low-memory instances.
