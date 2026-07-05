import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const htmlPath = path.join(root, 'dist', 'index.html');
const cssPath = path.join(root, 'dist', 'assets', 'render-fallback.css');
const jsPath = path.join(root, 'dist', 'assets', 'app.js');

function assertFile(filePath, label) {
  if (!fs.existsSync(filePath)) throw new Error(`${label} missing: ${filePath}`);
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size === 0) throw new Error(`${label} is empty: ${filePath}`);
  return fs.readFileSync(filePath, 'utf8');
}

const html = assertFile(htmlPath, 'Render HTML');
const css = assertFile(cssPath, 'Render fallback CSS');
assertFile(jsPath, 'Render app bundle');

const requiredHtml = [
  'tailwind.config',
  'cdn.tailwindcss.com',
  '/assets/render-fallback.css',
  '/assets/app.js',
];
const requiredCss = [
  '[data-slot="card"]',
  '[data-slot="button"]',
  '[data-slot="table"]',
  '[data-slot="input"]',
  '[data-slot="dialog-content"]',
  '[data-slot="tabs-list"]',
  '[data-slot="tabs"]',
  '[data-slot="tabs-content"]',
  '[data-slot="tabs-trigger"][data-active]',
  '[data-slot="tabs-content"][hidden]',
];

for (const token of requiredHtml) {
  if (!html.includes(token)) throw new Error(`Render HTML is missing ${token}`);
}
for (const token of requiredCss) {
  if (!css.includes(token)) throw new Error(`Render fallback CSS is missing ${token}`);
}

console.log('Render UI verification passed: Tailwind config, fallback CSS, and app bundle are present.');
