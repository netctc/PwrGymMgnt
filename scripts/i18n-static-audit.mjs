import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourceRoot = path.join(root, 'src');
const outputPath = path.join(root, 'docs', 'i18n-static-text-audit.json');
const extensions = new Set(['.tsx']);
const ignoreDirs = new Set(['node_modules', 'dist', '.git']);
const staticDictionaryPaths = [
  path.join(sourceRoot, 'i18n', 'staticText.ts'),
  path.join(sourceRoot, 'i18n', 'staticTextExpanded.ts'),
];
const staticDictionary = staticDictionaryPaths
  .filter((dictionaryPath) => fs.existsSync(dictionaryPath))
  .map((dictionaryPath) => fs.readFileSync(dictionaryPath, 'utf8'))
  .join('\n');

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoreDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (extensions.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

function compact(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function extractCandidates(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const candidates = [];
  const patterns = [
    />\s*([^<>{}\n][^<>{}]{1,120}?)\s*</g,
    /\b(?:placeholder|aria-label|title|alt)=['"]([^'"]{2,120})['"]/g,
    /\b(?:title|description|note|label|placeholder)=['"]([^'"]{2,120})['"]/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = compact(match[1] || '');
      if (!value) continue;
      if (!/^[A-Za-z0-9]/.test(value)) continue;
      if (/^[\d\s.,:%$€£¥+-]+$/.test(value)) continue;
      if (/^[a-z0-9_.-]+$/.test(value)) continue;
      if (/[{};]/.test(value)) continue;
      if (/^0\s*(?:&&|\?)/.test(value)) continue;
      if (/\b(const|let|return|import|export|interface|type|Array|Record|Partial|useState|useMemo|useEffect)\b/.test(value)) continue;
      if (value.includes('=>') || value.includes('</') || value.includes('/api/')) continue;
      candidates.push(value);
    }
  }
  return [...new Set(candidates)];
}

const files = walk(sourceRoot);
const byFile = [];
const unique = new Set();
for (const file of files) {
  const candidates = extractCandidates(file);
  if (candidates.length === 0) continue;
  for (const candidate of candidates) unique.add(candidate);
  byFile.push({ file: path.relative(root, file), candidates });
}


function isIntentionalStaticTextException(value) {
  return [
    /^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/,
    /^(?:API|CSV|PDF|QR|POS|SKU|COGS|HIIT|JPEG|PNG|USB|TOTAL)$/,
    /^\d+(?:\.\d+)?(?:xx)?$/,
    /^void \| Promise$/,
  ].some((pattern) => pattern.test(value)) || [
    'Assaf IT Consulting & Support',
    'FitAdmin Systems',
    'PowerGym Management',
    'PowerGym Management system',
    'admin, reception, trainer...',
  ].includes(value);
}

const covered = [];
const exceptionCandidates = [];
const notCovered = [];
for (const candidate of [...unique].sort((a, b) => a.localeCompare(b))) {
  const isCovered = staticDictionary.includes(`'${candidate.replace(/'/g, "\'")}'`) || staticDictionary.includes(`"${candidate.replace(/"/g, '\"')}"`);
  if (isCovered) covered.push(candidate);
  else if (isIntentionalStaticTextException(candidate)) exceptionCandidates.push(candidate);
  else notCovered.push(candidate);
}

const report = {
  generatedAt: new Date().toISOString(),
  supportedLocales: ['en', 'fr', 'ar', 'es'],
  scannedFiles: files.length,
  filesWithCandidates: byFile.length,
  uniqueStaticTextCandidates: unique.size,
  runtimeDictionaryEntries: (staticDictionary.match(/^\s*['\"]((?:[^'\"\\]|\\.)*)['\"]\s*:/gm) || []).length,
  candidatesCoveredByRuntimeDictionary: covered.length,
  intentionallyPreservedCandidates: exceptionCandidates,
  candidatesNotYetExplicitlyMapped: notCovered,
  localizationCoveragePercent: Number((((covered.length + exceptionCandidates.length) / Math.max(unique.size, 1)) * 100).toFixed(2)),
  note: 'The runtime static text localizer translates exact strings in visible text nodes plus placeholder, aria-label, title, alt, document title and meta description. Exception candidates are product names, acronyms, sample addresses, or technical identifiers that should intentionally remain unchanged.',
  byFile,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ outputPath: path.relative(root, outputPath), ...report, byFile: undefined }, null, 2));
