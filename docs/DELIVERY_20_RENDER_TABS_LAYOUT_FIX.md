# Delivery 20 - Render Tabs Layout Fix

## Problem

Some pages rendered correctly locally but had layout errors on Render. The visible example was Accounting & Finance, where the tab navigation appeared in a left column and the active tab content appeared to the right, leaving a large empty area below the tabs.

## Root cause

The local build uses the full Vite/Tailwind/shadcn pipeline, including custom variants used by the Base UI tab components. The Render Free/low-memory build uses a lightweight esbuild + Tailwind CDN path. Tailwind CDN does not process the same custom variants, especially the tab orientation classes such as `data-horizontal:flex-col` and group-data variants.

Because the base Tabs component still had `display: flex` but did not receive the processed `flex-col` style in Render, tab lists and panels rendered side-by-side.

## Fix

- Updated `src/components/ui/tabs.tsx` to apply explicit orientation classes at runtime:
  - horizontal tabs -> `flex-col`
  - vertical tabs -> `flex-row items-start`
- Updated `scripts/build-render-lite.mjs` to emit Render fallback CSS for:
  - `data-slot="tabs"`
  - `data-slot="tabs-list"`
  - `data-slot="tabs-trigger"`
  - `data-slot="tabs-content"`
- Added active-state support for Base UI/Radix style attributes:
  - `data-active`
  - `data-state="active"`
  - `aria-selected="true"`
- Added hidden panel fallback for `[hidden]` panels.

## Affected pages

This fix applies to all pages using tab sections, including:

- Accounting & Finance
- HR & Payroll
- Employees
- Members
- Classes
- Private PT
- Reports
- Settings

## Render settings

Keep Render configured as:

```txt
Build Command:
npm run render:build && npm run render:predeploy

Start Command:
npm run render:start
```

Do not use `npm run build` for the Render Free/low-memory deployment.
