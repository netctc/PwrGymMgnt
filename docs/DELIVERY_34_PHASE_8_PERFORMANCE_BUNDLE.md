# Delivery 34 - Phase 8 Performance and Bundle Optimization

## Scope

This phase optimizes the frontend bundle and route loading behavior after the e-card subscription hotfix. The backend behavior and security/reporting logic from previous phases are preserved.

## Implemented changes

### 1. Route-level lazy loading

`src/App.tsx` now uses `React.lazy` and `Suspense` for application pages:

- Dashboard
- Login
- Members
- Plans
- Classes
- Private PT
- HR
- Accounting
- QR Scanner
- Settings
- Support
- Reports

This prevents all page modules from being bundled into the initial application chunk.

### 2. Shared page loading fallback

Added:

- `src/components/PageFallback.tsx`

This gives route transitions a consistent loading state when a lazy page chunk is being downloaded.

### 3. Navigation preloading

Added:

- `src/lib/routePreload.ts`

`src/components/Layout.tsx` now preloads route chunks when a user hovers or focuses a navigation item. This keeps the initial bundle smaller while making common navigation feel fast.

### 4. PDF libraries loaded on demand

`src/pages/Accounting.tsx` no longer imports `jspdf` and `jspdf-autotable` statically. They are dynamically imported only when the user clicks PDF export.

This avoids loading PDF generation code during normal Accounting page visits.

### 5. Vite manual chunking

`vite.config.ts` now separates heavy optional libraries into dedicated chunks:

- `vendor-pdf-core`
- `vendor-pdf-table`
- `vendor-html2canvas`
- `vendor-dompurify`
- `vendor-recharts`
- `vendor-d3`
- `vendor-qr`

The previous large single application bundle is split into smaller route and vendor chunks.

### 6. Bundle budget check

Added:

- `scripts/verify-bundle-budget.mjs`

New script:

```bash
npm run bundle:budget
```

`verify:ci` now runs:

```bash
npm run lint && npm run test:ci && npm run build && npm run bundle:budget && npm run audit
```

Default limits:

- JavaScript chunk limit: `900 KB`
- CSS chunk limit: `150 KB`

Override with:

```bash
BUNDLE_MAX_JS_KB=900 BUNDLE_MAX_CSS_KB=150 npm run bundle:budget
```

## Verification

Commands executed individually in the sandbox:

```bash
npm ci --ignore-scripts
npm run lint
npm run test:ci
npm run build
npm run bundle:budget
npm run audit
```

Results:

- `npm ci --ignore-scripts`: OK
- `lint`: OK
- `test:ci`: OK, 38/38 tests
- `build`: OK
- `bundle:budget`: OK
- `audit`: OK, 0 vulnerabilities

A full `npm run verify:ci` was also started, but the sandbox terminated it during the build stage. The same steps passed individually and should run as a single command in the normal development/CI environment.

## Build output highlights

The previous frontend build had a large `index` chunk around 2 MB. After this phase, the app is split into route chunks and vendor chunks. Largest observed JS chunks were:

- `vendor-pdf-core`: about 382 KB
- `vendor-recharts`: about 336 KB
- main `index`: about 329 KB
- `vendor-html2canvas`: about 198 KB
- `index.es`: about 156 KB

No Vite chunk warning remained in the final build.

## Follow-up recommendations

1. Move chart widgets in Dashboard and Security Center into lazy subcomponents to keep chart libraries out of routes until charts are visible.
2. Consider replacing or further deferring Base UI components that are rarely used.
3. Add Lighthouse or Playwright performance smoke checks after deployment.
4. Review image and font loading strategy for production.
