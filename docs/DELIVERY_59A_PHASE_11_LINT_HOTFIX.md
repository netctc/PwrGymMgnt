# Delivery 59A - Phase 11 Localization Lint Hotfix

## Summary

This hotfix resolves the TypeScript lint failure reported after Phase 11 localization completion.

## Issue

`npm run test:ci` passed with 131/131 tests, but `npm run lint` failed in `src/i18n/staticText.ts` because TypeScript narrowed `window` incorrectly in the fallback scheduler branch:

```text
Property 'setTimeout' does not exist on type 'never'.
```

## Fix

The static text localization scheduler now uses `globalThis.setTimeout` for the fallback branch and `globalThis.clearTimeout` during cleanup. This avoids fragile `window` narrowing while preserving browser behavior.

## Changed file

- `src/i18n/staticText.ts`

## Validation

Static source inspection confirms the failing `window.setTimeout` usage was removed and replaced with `globalThis.setTimeout`.

Full validation to run locally:

```bash
npm run test:ci
npm run lint
npm run build
```
