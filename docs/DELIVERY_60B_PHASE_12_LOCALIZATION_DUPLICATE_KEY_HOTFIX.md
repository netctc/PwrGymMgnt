# Delivery 60B — Phase 12 Localization Duplicate-Key Hotfix

## Summary

This hotfix resolves the TypeScript duplicate-property errors reported in `src/i18n/staticTextExpanded.ts` after Phase 12A.

The previous file made the manual terminology refinements syntactically valid, but those refinements were still embedded inside the same object literal as the generated expanded dictionary. TypeScript correctly rejected this because several manual refinement keys already existed earlier in the generated object.

## Changes

- Refactored `src/i18n/staticTextExpanded.ts` into three layers:
  - `generatedExpandedStaticTextTranslations`
  - `phase12ManualTerminologyOverrides`
  - exported merged `expandedStaticTextTranslations`
- The exported dictionary keeps the manual terminology refinements by spreading the override layer after the generated layer.
- Updated `tests/phase12LocalizationAudit.test.ts` with regression guards that verify:
  - manual overrides stay in a separate merge layer,
  - generated entries do not duplicate top-level keys internally,
  - manual override entries do not duplicate top-level keys internally.
- Refreshed the localization audit report.

## Verification performed in the package workspace

- `node scripts/i18n-static-audit.mjs`
- `node --experimental-strip-types --check src/i18n/staticTextExpanded.ts`
- custom duplicate-key guard for the generated and override layers

See `docs/verification_phase12b_localization_duplicate_keys.log` for evidence.

## Expected local validation

Run:

```bash
npm run i18n:audit
npm run test:ci
npm run lint
npm run build
```

Expected result:

- localization audit remains at 100% coverage,
- Phase 11/12 localization tests pass,
- `npm run lint` no longer reports TS1117 duplicate property errors,
- production build succeeds.
