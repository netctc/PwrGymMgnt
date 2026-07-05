# Phase 11 - Localization Completion and Static Text Coverage

## Objective

Extend the Phase 8 localization foundation into a broader multilingual implementation for all current supported languages:

- English (`en`, LTR)
- French (`fr`, LTR)
- Arabic (`ar`, RTL)
- Spanish (`es`, LTR)

This phase focuses on closing gaps caused by hardcoded titles, labels, buttons, placeholders, aria labels, alt text, tooltips, page titles, and static metadata across the existing React application.

## Implementation Summary

### 1. Spanish locale support

Spanish was added to the supported locale registry in `src/i18n/config.ts` with:

- `code: 'es'`
- `htmlLang: 'es'`
- `intlLocale: 'es-ES'`
- `direction: 'ltr'`

The core application shell dictionary in `src/i18n/translations.ts` now includes Spanish keys matching English, French, and Arabic.

### 2. Runtime static text localization layer

A new static-text localization module was added:

```text
src/i18n/staticText.ts
```

It localizes:

- visible text nodes,
- `placeholder`,
- `aria-label`,
- `title`,
- `alt`,
- `document.title`,
- meta description content.

The layer preserves original English strings in memory so changing language restores/translates from the original text rather than translating already-translated content.

### 3. MutationObserver coverage

`LocalizationProvider` now activates `observeStaticTextLocalization(locale)`. This covers:

- lazy-loaded pages,
- modal content,
- dropdown content,
- toast/notification content,
- dynamic content that appears after initial render.

### 4. RTL and metadata continuity

The existing Phase 8 behavior is preserved:

- Arabic sets `html dir="rtl"`.
- English/French/Spanish set `dir="ltr"`.
- `html lang` and `data-locale` update when the user changes language.
- locale-aware number, currency, and date/time helpers remain available.

### 5. Translation coverage scope

The runtime dictionary includes explicit translations for high-traffic application areas:

- Dashboard
- Smart Action Center
- Members
- Membership plans
- Classes and private PT
- HR and payroll
- Accounting and finance
- Warehouse, inventory, purchase orders, POS, suppliers, product details
- Reports
- Settings
- Support
- Common labels, actions, statuses, table headers, empty states, filters, and modal actions

A conservative word glossary is also included to translate predictable short labels such as `Add Employee`, `Active Members`, `Product Details`, and similar static labels that appear as title-case UI text.

## Audit Evidence

A static-text audit script was added:

```bash
npm run i18n:audit
```

It writes:

```text
docs/i18n-static-text-audit.json
```

The audit identifies JSX text/attribute candidates and compares them with the runtime dictionary. It is intentionally conservative and should be used as a review queue for future page-by-page explicit `t(...)` migration.

## Validation

New and updated tests verify:

- English/French/Arabic/Spanish locale metadata.
- Core dictionary key parity across all supported locales.
- Runtime static text dictionary coverage for high-traffic pages.
- Static text observer activation from `LocalizationProvider`.
- Hidden/static attributes and metadata coverage.
- `npm run i18n:audit` registration.

Run:

```bash
npm run i18n:audit
npm run test:ci
npm run lint
npm run build
```

## Recommended Next Step

This runtime layer closes broad multilingual gaps quickly and safely. The longer-term best practice is to migrate each page from hardcoded JSX text to explicit `t('module.key')` keys, using `docs/i18n-static-text-audit.json` as the backlog.

Recommended migration order:

1. Dashboard and Smart Action Center
2. Warehouse/POS
3. Accounting/Finance
4. HR/Payroll
5. Members/Plans
6. Scheduling/Private PT
7. Settings/Security
8. Reports
9. Support
10. Shared forms, modals, tables, toasts
