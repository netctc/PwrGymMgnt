# Delivery 59C - Phase 11 Blank Page Hotfix

## Context
After Phase 11B, the API logs showed the expected unauthenticated `GET /api/auth/me -> 401` probes, but the browser displayed a blank page instead of the login form.

## Root Cause
The runtime static text localizer could write text and attribute values back into the DOM even when the active locale was English and the value did not change. Those no-op DOM writes can trigger the MutationObserver again and create a render/mutation loop during the unauthenticated login route mount.

A secondary hardening improvement was also added: the login page is now eagerly imported instead of lazy loaded so unauthenticated users always have the login screen available without depending on a lazy chunk boundary.

## Changes
- Updated `src/i18n/staticText.ts` so localization is idempotent:
  - English source-language nodes are not rewritten unless they were previously translated.
  - Text nodes are updated only when the final value actually changes.
  - Translatable attributes are updated only when the final value actually changes.
  - Document title and meta description are updated only when needed.
- Updated `src/App.tsx` so `Login` is eagerly imported and rendered directly on `/login`.
- Added Phase 11C test coverage inside `tests/phase11LocalizationCompletion.test.ts`.

## Expected Runtime Behavior
Before login:
- `/api/auth/me` may return `401` and log at `info` level.
- The login page should render normally.
- `/api/engagement/notifications` should not be called until a user is authenticated.

## Validation
Run locally:

```bash
npm run test:ci
npm run lint
npm run build
npm run dev
```

Then open `http://localhost:3000/` in a hard-refreshed browser tab. The app should redirect to `/login` and display the login card.
