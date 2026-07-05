# Phase 8 - Multilingual and RTL Localization Foundation

## Objective

Phase 8 introduces a maintainable localization foundation for English, French, and Arabic/RTL support without attempting a risky full-page translation in one delivery. The implementation localizes the application shell first and creates reusable utilities for translating the remaining business modules incrementally.

## Delivered scope

### Supported languages

- English (`en`, left-to-right)
- French (`fr`, left-to-right)
- Arabic (`ar`, right-to-left)

Language metadata lives in `src/i18n/config.ts`.

### Translation dictionaries

Translation dictionaries live in `src/i18n/translations.ts` and currently cover the shared application shell:

- Sidebar navigation
- Breadcrumb labels
- Admin terminal label
- Logout action
- Notification drawer labels
- Role display fallback labels
- Loading state
- Language selector label

The dictionaries are intentionally strongly typed: French and Arabic must include the same keys as English before TypeScript and tests can pass.

### Localization context

`src/contexts/LocalizationContext.tsx` provides:

- selected locale
- text direction
- supported locale metadata
- translation helper `t()`
- localized date/time formatter
- localized number formatter
- localized currency formatter
- localStorage persistence using `powergym.locale`
- `html lang`, `html dir`, and `data-locale` synchronization

### Language switcher

`src/components/LanguageSwitcher.tsx` adds a compact language selector to the authenticated application header.

### RTL support

RTL activation is handled at two levels:

1. `document.documentElement.dir = "rtl"` when Arabic is selected.
2. Layout-level directional classes and CSS fixes for sidebar borders, notification positions, spacing reversal, and form alignment.

CSS additions are in `src/index.css`.

## Implementation notes

This phase intentionally avoids machine-translating all large business modules at once. Remaining pages should migrate gradually by replacing hardcoded UI strings with typed translation keys.

Recommended migration order:

1. Login and authentication screens
2. Dashboard cards and charts
3. Membership screens
4. Scheduling screens
5. HR and payroll screens
6. Finance and accounting screens
7. Warehouse, inventory, POS, and reports
8. Settings, support, and operational admin screens

## Data and content strategy

Future database-level localization should add separate translatable content fields or translation tables for business-managed text such as:

- membership plan descriptions
- product names/descriptions where needed
- notification templates
- report titles/descriptions
- email/SMS/WhatsApp templates
- support messages

Do not overwrite canonical business identifiers with translated display labels. Keep stable codes and localize only user-facing labels.

## Acceptance criteria

- English, French, and Arabic are selectable from the UI.
- Selected locale persists between sessions.
- Arabic sets `html dir="rtl"`.
- The application shell changes direction and labels without page reload.
- Translation dictionaries have complete key coverage.
- Date/time rendering in the notification drawer uses locale-aware formatting.
