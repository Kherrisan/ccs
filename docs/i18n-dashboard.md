# Dashboard i18n Guide

Last Updated: 2026-04-14

This document describes the internationalization (i18n) architecture used by the CCS Dashboard (`ui/`), how locale selection works, and how to add new languages safely.

---

## Scope

Dashboard i18n currently covers UI text rendered by React components.

- Supported locales today:
  - `en` (English)
  - `zh-CN` (Simplified Chinese)
  - `vi` (Vietnamese)
  - `ja` (Japanese)
- Locale state is persisted in browser localStorage using `ccs-ui-locale`.
- Fallback language is `en`.

Out of scope:

- CLI terminal output localization
- Backend/API payload localization

---

## Architecture

### Initialization

- File: `ui/src/App.tsx`
- `import '@/lib/i18n'` initializes i18next once before routes render.

### Translation resources

- File: `ui/src/lib/i18n.ts`
- Contains `resources` object with locale blocks:
  - `en.translation`
  - `zh-CN.translation`
  - `vi.translation`
  - `ja.translation`
- Uses `initReactI18next` for React integration.

### Locale utilities

- File: `ui/src/lib/locales.ts`
- Core helpers:
  - `normalizeLocale(locale)` maps browser/storage values to supported app locales.
  - `getInitialLocale` chooses stored locale, then browser locale, then `en`.
  - `persistLocale` writes normalized locale to localStorage.

### Language switcher

- File: `ui/src/components/layout/language-switcher.tsx`
- Uses `react-i18next` + shadcn `Select`.
- Calls `persistLocale` and `i18n.changeLanguage` on selection.

### Test bootstrap

- File: `ui/tests/setup/vitest-setup.ts`
- Test setup must import `ui/src/lib/i18n.ts` so direct `useTranslation()` consumers resolve the same singleton instance as the app.
- If a test mocks `useTranslation()`, keep the mocked key surface aligned with the component output or the assertions will drift.

---

## Key Conventions

### Translation key naming

Use dot-notation namespaces by feature area:

- `nav.home`
- `cursorPage.title`
- `settingsTabs.web`

Keep key names stable and semantic to minimize churn across locales.

### Pluralization

For count-based strings, use i18next suffix rules:

- `<key>_one`
- `<key>_other`

Examples exist in sync/account counters.

### Interpolation and rich text

- Use interpolation for runtime values: `t('key', { value })`.
- Prefer plain text keys whenever possible.
- If formatting is required (for example bold segments), use `<Trans />` instead of `dangerouslySetInnerHTML`.

---

## Adding a New Locale

When adding a locale such as Thai (`th`):

1. Add locale id to the supported locale list in `ui/src/lib/locales.ts`.
2. Add locale display label under `translation.locale` in `ui/src/lib/i18n.ts`.
3. Add a full `<locale>.translation` block with all keys.
4. Verify fallback behavior remains `en` for missing keys.
5. Run UI validation and i18n tests:
   - `cd ui && bun run validate`
   - `cd ui && bun run test:run tests/unit/ui/i18n/language-switcher.test.tsx`
6. Add or update key-parity tests to catch locale drift.

Current issue driving the Vietnamese rollout:

- https://github.com/kaitranntt/ccs/issues/659

---

## Contributor Checklist

Before opening a PR that touches i18n:

- [ ] New UI strings are translated in all supported locales.
- [ ] No raw key literals appear in UI at runtime.
- [ ] No unsafe HTML injection path introduced for translated content.
- [ ] `ui` validate/test commands pass.
- [ ] This document is updated if architecture or conventions changed.
