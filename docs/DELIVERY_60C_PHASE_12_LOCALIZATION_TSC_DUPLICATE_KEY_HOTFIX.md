# Delivery 60C - Phase 12C Localization TSC Duplicate-Key Hotfix

## Summary

Phase 12C resolves the TypeScript compiler failure reported after Phase 12B where `npm run test:ci` passed but `npm run lint` failed with `TS1117: An object literal cannot have multiple properties with the same name` in `src/i18n/staticTextExpanded.ts`.

The underlying localization coverage remained valid. The issue was structural: manual terminology overrides used object-literal property syntax for keys that intentionally also existed in the generated localization dictionary. TypeScript rejects duplicate literal keys even when the intended runtime behavior is to override generated values.

## Changes

### `src/i18n/staticTextExpanded.ts`

- Kept the generated dictionary in `generatedExpandedStaticTextTranslations`.
- Converted manual terminology overrides from object-literal properties into `phase12ManualTerminologyOverrideEntries`, an array of `[key, translations]` pairs.
- Rebuilt `phase12ManualTerminologyOverrides` with `Object.fromEntries(...)` and cast it to the expected record type.
- Preserved the final merge behavior:

```ts
export const expandedStaticTextTranslations = {
  ...generatedExpandedStaticTextTranslations,
  ...phase12ManualTerminologyOverrides,
};
```

This preserves manual override precedence without declaring duplicate object-literal properties.

### `tests/phase12LocalizationAudit.test.ts`

- Updated the merge-layer regression test to require the manual overrides to use `phase12ManualTerminologyOverrideEntries`.
- Added a guard that manual override entries do not use duplicate-prone object-literal key syntax.
- Kept duplicate-key checks for both the generated dictionary and the manual override entry list.

## Static verification

The package was statically verified with the following result:

```json
{
  "generatedKeys": 536,
  "overrideEntries": 52,
  "generatedDuplicates": 0,
  "overrideDuplicates": 0,
  "overrideUsesArrayEntries": true
}
```

## Recommended validation

Run:

```bash
npm run i18n:audit
npm run test:ci
npm run lint
npm run build
```

Expected result:

- i18n audit remains at 100% coverage.
- test suite remains green.
- `npm run lint` no longer reports `TS1117` duplicate-property errors in `staticTextExpanded.ts`.
- production build succeeds.
