import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SUPPORTED_LOCALES, resolveLocale, getLocaleDirection } from "../src/i18n/config";
import { translations, englishTranslations } from "../src/i18n/translations";
import { staticTextTranslations, translateStaticText } from "../src/i18n/staticText";

test("Localization completion supports Arabic, English, French and Spanish", () => {
  assert.deepEqual(SUPPORTED_LOCALES.map((locale) => locale.code), ["en", "fr", "ar", "es"]);
  assert.equal(resolveLocale("es-MX"), "es");
  assert.equal(getLocaleDirection("ar"), "rtl");
  assert.equal(getLocaleDirection("es"), "ltr");
});

test("Core translation dictionaries are complete across every supported locale", () => {
  const englishKeys = Object.keys(englishTranslations).sort();
  for (const locale of SUPPORTED_LOCALES.map((item) => item.code)) {
    assert.deepEqual(Object.keys(translations[locale]).sort(), englishKeys, `${locale} core dictionary must match English keys`);
  }
});

test("Runtime static text localization covers high-traffic application areas", () => {
  const requiredTexts = [
    "PowerGym Management",
    "Dashboard",
    "Smart Action Center",
    "Members",
    "Plans",
    "Classes",
    "HR & Payroll",
    "Accounting",
    "Warehouse & POS",
    "Inventory Management",
    "Product Catalog",
    "Support & Contact",
    "Settings",
    "Save Changes",
    "No records found.",
  ];

  for (const text of requiredTexts) {
    assert.ok(staticTextTranslations[text], `${text} should be present in the static text dictionary`);
    assert.equal(typeof staticTextTranslations[text].fr, "string");
    assert.equal(typeof staticTextTranslations[text].ar, "string");
    assert.equal(typeof staticTextTranslations[text].es, "string");
  }

  assert.equal(translateStaticText("fr", "Warehouse & POS"), "Entrepôt & PDV");
  assert.equal(translateStaticText("ar", "Warehouse & POS"), "المستودع ونقطة البيع");
  assert.equal(translateStaticText("es", "Warehouse & POS"), "Almacén y TPV");
  assert.equal(translateStaticText("en", "Warehouse & POS"), "Warehouse & POS");
});

test("Localization provider activates static text observer and hidden metadata translation", () => {
  const localizationContext = fs.readFileSync(path.join(process.cwd(), "src/contexts/LocalizationContext.tsx"), "utf8");
  const staticText = fs.readFileSync(path.join(process.cwd(), "src/i18n/staticText.ts"), "utf8");
  const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));

  assert.match(localizationContext, /observeStaticTextLocalization\(locale\)/);
  assert.match(staticText, /TRANSLATABLE_ATTRIBUTES = \['placeholder', 'aria-label', 'title', 'alt'\]/);
  assert.match(staticText, /meta\[name="description"\]/);
  assert.match(staticText, /document\.title/);
  assert.match(packageJson.scripts["i18n:audit"], /i18n-static-audit/);
  assert.match(packageJson.scripts["test:ci"], /phase11LocalizationCompletion\.test\.ts/);
});


test("Phase 11B notification polling waits for an authenticated user", () => {
  const layout = fs.readFileSync(path.join(process.cwd(), "src/components/Layout.tsx"), "utf8");

  assert.match(layout, /const \{ user, profile, logout \} = useAuth\(\)/);
  assert.match(layout, /if \(!user\) \{\s*resetNotifications\(\);\s*return;\s*\}/s);
  assert.match(layout, /globalThis\.setInterval\(loadNotifications, 60000\)/);
  assert.match(layout, /\}, \[user\?\.uid\]\)/);
  assert.match(layout, /if \(!user\) return;/);
});

test("Phase 11C static text localization avoids no-op DOM writes in English", () => {
  const staticText = fs.readFileSync(path.join(process.cwd(), "src/i18n/staticText.ts"), "utf8");

  assert.match(staticText, /locale === 'en' && !storedOriginal\) return/);
  assert.match(staticText, /if \(currentValue === nextValue\) return/);
  assert.match(staticText, /if \(current === nextValue\) continue/);
  assert.match(staticText, /if \(document\.title !== nextTitle\) document\.title = nextTitle/);
});

test("Phase 11C login route is eagerly available for unauthenticated users", () => {
  const app = fs.readFileSync(path.join(process.cwd(), "src/App.tsx"), "utf8");

  assert.match(app, /import Login from '\.\/pages\/Login'/);
  assert.doesNotMatch(app, /const Login = lazy/);
  assert.match(app, /<Route path="\/login" element=\{<Login \/>\} \/>/);
});
