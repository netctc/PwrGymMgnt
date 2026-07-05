# Delivery 58A - Phase 10 Validation Hotfix

## Objective

Resolve Phase 10 local validation issues reported after applying the Cloud/API/Production Excellence package.

## Issues addressed

1. `server/modules.ts` referenced `registerProductionReadinessRoutes` without importing it.
2. `tests/deploymentOperations.test.ts` still expected the pre-Phase-10 smoke check list and did not include `production-readiness` when `includeReadiness=true`.
3. `tests/phase4Architecture.test.ts` still expected the pre-Phase-10 route module order and did not include the new `production-readiness` platform module.

## Changes made

- Added the missing import in `server/modules.ts`:
  - `import { registerProductionReadinessRoutes } from "./productionReadiness";`
- Updated deployment smoke helper test expectations to include:
  - `production-readiness`
- Updated Phase 4 route registry test expectations to include:
  - `production-readiness` immediately after `platform-security`.

## Functional impact

No business behavior changed. This is a validation and integration-alignment hotfix only.

## Validation to run locally

```bash
npm run test:ci
npm run lint
npm run build
npm run api:export
npm run ops:production-readiness
npm run deploy:preflight -- --strict
```

## Expected result

- The two failing tests should pass.
- `npm run lint` should no longer report `Cannot find name 'registerProductionReadinessRoutes'`.
- Build, API export, production-readiness report and preflight should remain successful.
