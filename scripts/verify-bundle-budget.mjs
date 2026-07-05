import fs from 'node:fs';
import path from 'node:path';

const assetsDir = path.resolve('dist/assets');
const maxJsKb = Number(process.env.BUNDLE_MAX_JS_KB || 900);
const maxCssKb = Number(process.env.BUNDLE_MAX_CSS_KB || 150);

if (!fs.existsSync(assetsDir)) {
  console.error('Bundle budget check failed: dist/assets does not exist. Run npm run build first.');
  process.exit(1);
}

const files = fs.readdirSync(assetsDir)
  .filter((file) => file.endsWith('.js') || file.endsWith('.css'))
  .map((file) => {
    const fullPath = path.join(assetsDir, file);
    const sizeKb = fs.statSync(fullPath).size / 1024;
    return { file, sizeKb, type: file.endsWith('.js') ? 'js' : 'css' };
  })
  .sort((a, b) => b.sizeKb - a.sizeKb);

const violations = files.filter((entry) => {
  const limit = entry.type === 'js' ? maxJsKb : maxCssKb;
  return entry.sizeKb > limit;
});

const summary = files.slice(0, 12).map((entry) => `${entry.file}: ${entry.sizeKb.toFixed(1)} KB`).join('\n');
console.log(`Bundle budget summary:\n${summary || 'No JS/CSS assets found.'}`);

if (violations.length > 0) {
  console.error('\nBundle budget exceeded:');
  for (const entry of violations) {
    const limit = entry.type === 'js' ? maxJsKb : maxCssKb;
    console.error(`- ${entry.file}: ${entry.sizeKb.toFixed(1)} KB > ${limit} KB`);
  }
  process.exit(1);
}
