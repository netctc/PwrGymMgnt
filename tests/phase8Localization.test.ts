import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getLocaleDirection, isSupportedLocale, resolveInitialLocale, SUPPORTED_LOCALES } from "../src/i18n/config";
import { englishTranslations, translations, translate } from "../src/i18n/translations";

test("Phase 8 supports English, French, Arabic and Spanish locale metadata", () => {
  assert.deepEqual(SUPPORTED_LOCALES.map((locale) => locale.code), ["en", "fr", "ar", "es"]);
  assert.equal(isSupportedLocale("fr"), true);
  assert.equal(isSupportedLocale("ar"), true);
  assert.equal(isSupportedLocale("es"), true);
  assert.equal(getLocaleDirection("en"), "ltr");
  assert.equal(getLocaleDirection("fr"), "ltr");
  assert.equal(getLocaleDirection("ar"), "rtl");
  assert.equal(getLocaleDirection("es"), "ltr");
  assert.equal(resolveInitialLocale({ storedLocale: "ar", browserLocale: "fr-FR" }), "ar");
  assert.equal(resolveInitialLocale({ storedLocale: "unsupported", browserLocale: "fr-FR" }), "fr");
});

test("Phase 8 translation dictionaries have complete key coverage", () => {
  const englishKeys = Object.keys(englishTranslations).sort();
  for (const locale of ["en", "fr", "ar", "es"] as const) {
    assert.deepEqual(Object.keys(translations[locale]).sort(), englishKeys, `${locale} is missing translation keys`);
  }
  assert.equal(translate("fr", "nav.dashboard"), "Tableau de bord");
  assert.equal(translate("ar", "nav.dashboard"), "لوحة التحكم");
  assert.equal(translate("es", "nav.dashboard"), "Panel");
});

test("Phase 8 application shell is wired to localization provider and switcher", () => {
  const app = fs.readFileSync(path.join(process.cwd(), "src/App.tsx"), "utf8");
  const layout = fs.readFileSync(path.join(process.cwd(), "src/components/Layout.tsx"), "utf8");
  const css = fs.readFileSync(path.join(process.cwd(), "src/index.css"), "utf8");

  assert.match(app, /LocalizationProvider/);
  assert.match(app, /useLocalization/);
  assert.match(layout, /LanguageSwitcher/);
  assert.match(layout, /labelKey: TranslationKey/);
  assert.match(layout, /dir=\{direction\}/);
  assert.match(layout, /formatDateTime\(item\.createdAt\)/);
  assert.match(css, /html\[dir="rtl"\]/);
});

test("Phase 8 language selection persists via a namespaced localStorage key", () => {
  const localizationContext = fs.readFileSync(path.join(process.cwd(), "src/contexts/LocalizationContext.tsx"), "utf8");
  assert.match(localizationContext, /LOCALIZATION_STORAGE_KEY/);
  assert.match(localizationContext, /document\.documentElement\.lang/);
  assert.match(localizationContext, /document\.documentElement\.dir/);
  assert.match(localizationContext, /localStorage\.setItem\(LOCALIZATION_STORAGE_KEY, locale\)/);
});
