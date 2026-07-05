# Delivery 19 - Render UI Parity Fix

## Purpose

Some pages looked correct locally but had visual/design issues on Render, especially operational pages with complex tables and forms:

- Employees
- HR & Payroll
- Accounting
- Scheduling / Classes
- Private PT
- Reports and related admin pages

The application had previously been switched to a low-memory Render build because the full Vite/Tailwind build exceeded the memory available on the Render instance. That low-memory build bundled the React app with esbuild and used Tailwind CDN, but it did not fully reproduce the local Tailwind/shadcn design tokens.

## Root Cause

The Render-only lite build ignored the local Tailwind/shadcn CSS pipeline. As a result, classes such as `bg-background`, `text-muted-foreground`, `border-border`, `bg-card`, `text-card-foreground`, and shadcn component styling were not always available on Render.

## Implemented Fix

Updated `scripts/build-render-lite.mjs` to generate:

1. A Render fallback CSS file with the same CSS variable theme from `src/index.css`.
2. Component-level fallback CSS for shadcn slots:
   - cards
   - buttons
   - inputs
   - textareas
   - selects
   - labels
   - tables
   - dialogs
   - tabs
   - avatars
3. A Tailwind CDN configuration that maps the application theme colors and radii to the same CSS variables used locally.
4. A Render UI verification script.

## New Script

```bash
npm run render:ui-check
```

This checks that the Render build output contains:

- generated `dist/index.html`
- generated `dist/assets/app.js`
- generated `dist/assets/render-fallback.css`
- Tailwind CDN configuration
- component fallback rules for important UI elements

`render:build` now runs this check automatically after the Render build.

## Render Settings

Keep using:

```txt
Build Command:
npm run render:build && npm run render:predeploy
```

```txt
Start Command:
npm run render:start
```

## Notes

This fix keeps the local Vite build unchanged. Local development and production builds still use the normal Tailwind/shadcn pipeline. The fallback applies only to the Render low-memory build path.
