import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { translateStaticText } from "../src/i18n/staticText";
import { expandedStaticTextTranslations } from "../src/i18n/staticTextExpanded";

test("Phase 12 localization audit reaches complete static-text coverage", () => {
  const auditPath = path.join(process.cwd(), "docs/i18n-static-text-audit.json");
  const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));

  assert.equal(audit.supportedLocales.join(","), "en,fr,ar,es");
  assert.ok(audit.uniqueStaticTextCandidates >= 700, "audit should scan broad page-level static text");
  assert.equal(audit.localizationCoveragePercent, 100);
  assert.deepEqual(audit.candidatesNotYetExplicitlyMapped, []);
});

test("Phase 12 expanded dictionary covers page titles, labels, placeholders, and messages", () => {
  const requiredTexts = [
    "Accounting & Finance",
    "Access Denied",
    "Barcode Scanner",
    "Create a monthly payroll run from active employees, salary rules, allowances, deductions, and attendance.",
    "Download the finance transaction PDF using the active ledger filters.",
    "Scan QR with USB reader or paste secure token...",
    "Webcam QR detection requires browser BarcodeDetector support. USB QR scanners and manual token entry still work.",
    "Schedule Session(s)",
    "Screen-specific filtered PDFs",
  ];

  for (const text of requiredTexts) {
    assert.ok(expandedStaticTextTranslations[text], `${text} should be mapped in expanded static translations`);
    assert.equal(typeof expandedStaticTextTranslations[text].fr, "string");
    assert.equal(typeof expandedStaticTextTranslations[text].ar, "string");
    assert.equal(typeof expandedStaticTextTranslations[text].es, "string");
    assert.notEqual(translateStaticText("fr", text), text);
    assert.notEqual(translateStaticText("ar", text), text);
    assert.notEqual(translateStaticText("es", text), text);
  }
});

test("Phase 12 audit output is not truncated", () => {
  const auditScript = fs.readFileSync(path.join(process.cwd(), "scripts/i18n-static-audit.mjs"), "utf8");
  assert.doesNotMatch(auditScript, /notCovered\.slice\(0,\s*300\)/);
  assert.match(auditScript, /localizationCoveragePercent/);
  assert.match(auditScript, /staticTextExpanded\.ts/);
});

test("Phase 12 expanded dictionary keeps manual overrides in a tsc-safe merge layer", () => {
  const expandedDictionary = fs.readFileSync(path.join(process.cwd(), "src/i18n/staticTextExpanded.ts"), "utf8");

  assert.doesNotMatch(expandedDictionary, /\n,\n\s*\/\/ Phase 12 manual terminology overrides/);
  assert.match(expandedDictionary, /const generatedExpandedStaticTextTranslations/);
  assert.match(expandedDictionary, /const phase12ManualTerminologyOverrideEntries/);
  assert.match(expandedDictionary, /Object\.fromEntries\([\s\S]*phase12ManualTerminologyOverrideEntries/);
  assert.match(expandedDictionary, /export const expandedStaticTextTranslations[\s\S]*\.\.\.generatedExpandedStaticTextTranslations,[\s\S]*\.\.\.phase12ManualTerminologyOverrides,/);
});

test("Phase 12 generated dictionary and manual override entries avoid tsc duplicate-key errors", () => {
  const expandedDictionary = fs.readFileSync(path.join(process.cwd(), "src/i18n/staticTextExpanded.ts"), "utf8");
  const generatedBlock = expandedDictionary.match(/const generatedExpandedStaticTextTranslations[^=]*= \{([\s\S]*?)\n\};/)?.[1] || "";
  const overrideEntriesBlock = expandedDictionary.match(/const phase12ManualTerminologyOverrideEntries[^=]*= \[([\s\S]*?)\n\];/)?.[1] || "";

  const generatedKeys = generatedBlock
    .split("\n")
    .map((line) => line.match(/^  ["']([^"']+)["']\s*:/)?.[1])
    .filter(Boolean);
  const generatedDuplicateKeys = generatedKeys.filter((key, index) => generatedKeys.indexOf(key) !== index);
  assert.deepEqual(generatedDuplicateKeys, []);

  const overrideEntryKeys = overrideEntriesBlock
    .split("\n")
    .map((line) => line.match(/^  \[["']([^"']+)["']\s*,/)?.[1])
    .filter(Boolean);
  const overrideDuplicateKeys = overrideEntryKeys.filter((key, index) => overrideEntryKeys.indexOf(key) !== index);
  assert.deepEqual(overrideDuplicateKeys, []);

  assert.doesNotMatch(overrideEntriesBlock, /^  ["'][^"']+["']\s*:/m, "manual overrides must not use duplicate-prone object-literal keys");
});
