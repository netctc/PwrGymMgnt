import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const assets = path.join(dist, 'assets');

function rmrf(target) {
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

function extractThemeCss() {
  const cssPath = path.join(root, 'src', 'index.css');
  const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';
  const rootMatch = css.match(/:root\s*\{[\s\S]*?\n\}/);
  const darkMatch = css.match(/\.dark\s*\{[\s\S]*?\n\}/);
  return `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
${rootMatch ? rootMatch[0] : ''}
${darkMatch ? darkMatch[0] : ''}
* { box-sizing: border-box; border-color: var(--border, #e5e7eb); }
html { font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
body { margin: 0; min-height: 100vh; background: var(--background, #fafafa); color: var(--foreground, #111827); }
button, input, select, textarea { font: inherit; }
a { color: inherit; text-decoration: none; }

/* Render-only UI fallback.
   The normal local build uses Vite + Tailwind/shadcn. Render Free can run out of
   memory during that build, so the lite build uses Tailwind CDN plus these
   component fallbacks to preserve layout on operational pages such as Employees,
   HR & Payroll, Accounting, Scheduling and Reports. */
[data-slot="card"] {
  background: var(--card, #fff);
  color: var(--card-foreground, #111827);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: calc(var(--radius, .625rem) * 1.4);
  box-shadow: 0 1px 2px rgba(15, 23, 42, .04);
}
[data-slot="card-header"] { display: grid; gap: .375rem; padding: 1.25rem 1.25rem .75rem; }
[data-slot="card-title"] { font-size: 1rem; line-height: 1.5rem; font-weight: 700; letter-spacing: -.01em; }
[data-slot="card-description"] { color: var(--muted-foreground, #64748b); font-size: .875rem; line-height: 1.25rem; }
[data-slot="card-content"] { padding: 1rem 1.25rem 1.25rem; }
[data-slot="card-footer"] { display: flex; align-items: center; gap: .75rem; padding: .75rem 1.25rem 1.25rem; }

[data-slot="button"] {
  display: inline-flex; align-items: center; justify-content: center; gap: .375rem;
  min-height: 2rem; padding: .375rem .75rem; border-radius: .625rem;
  font-size: .875rem; font-weight: 600; line-height: 1.25rem;
  border: 1px solid transparent; cursor: pointer; transition: background-color .15s, color .15s, border-color .15s, opacity .15s;
}
[data-slot="button"]:disabled { pointer-events: none; opacity: .5; }
[data-slot="input"], [data-slot="textarea"], [data-slot="select-trigger"], input, select, textarea {
  border: 1px solid var(--input, #e2e8f0); border-radius: .625rem; background: #fff; color: var(--foreground, #111827);
}
[data-slot="input"], [data-slot="select-trigger"], input, select { min-height: 2.25rem; padding: .375rem .75rem; }
[data-slot="textarea"], textarea { min-height: 5rem; padding: .625rem .75rem; }
[data-slot="input"]:focus, [data-slot="textarea"]:focus, [data-slot="select-trigger"]:focus, input:focus, select:focus, textarea:focus {
  outline: 2px solid color-mix(in srgb, var(--ring, #94a3b8) 35%, transparent); outline-offset: 1px;
}
[data-slot="label"] { display: inline-flex; align-items: center; gap: .375rem; font-size: .875rem; font-weight: 600; color: var(--foreground, #111827); }

[data-slot="table-container"] { width: 100%; overflow-x: auto; }
[data-slot="table"] { width: 100%; border-collapse: collapse; caption-side: bottom; font-size: .875rem; }
[data-slot="table-row"] { border-bottom: 1px solid var(--border, #e5e7eb); }
[data-slot="table-row"]:hover { background: color-mix(in srgb, var(--muted, #f1f5f9) 55%, transparent); }
[data-slot="table-head"] { height: 2.5rem; padding: .5rem; text-align: left; vertical-align: middle; font-weight: 700; white-space: nowrap; color: var(--foreground, #111827); }
[data-slot="table-cell"] { padding: .5rem; vertical-align: middle; white-space: nowrap; }

[data-slot="dialog-overlay"], [data-slot="sheet-overlay"], [data-slot="alert-dialog-overlay"] { position: fixed; inset: 0; z-index: 50; background: rgba(0,0,0,.5); }
[data-slot="dialog-content"], [data-slot="alert-dialog-content"] {
  position: fixed; left: 50%; top: 50%; z-index: 51; width: min(92vw, 42rem); max-height: 90vh; overflow: auto;
  transform: translate(-50%, -50%); background: var(--popover, #fff); color: var(--popover-foreground, #111827);
  border: 1px solid var(--border, #e5e7eb); border-radius: 1rem; padding: 1.5rem; box-shadow: 0 20px 60px rgba(15,23,42,.25);
}
[data-slot="dialog-header"], [data-slot="alert-dialog-header"], [data-slot="sheet-header"] { display: flex; flex-direction: column; gap: .5rem; }
[data-slot="dialog-title"], [data-slot="alert-dialog-title"], [data-slot="sheet-title"] { font-size: 1.125rem; line-height: 1.75rem; font-weight: 700; }
[data-slot="dialog-description"], [data-slot="alert-dialog-description"], [data-slot="sheet-description"] { color: var(--muted-foreground, #64748b); font-size: .875rem; }
[data-slot="dialog-footer"], [data-slot="alert-dialog-footer"], [data-slot="sheet-footer"] { display: flex; justify-content: flex-end; gap: .5rem; margin-top: 1rem; }

/* Tabs: Base UI + shadcn use custom Tailwind variants locally.
   Tailwind CDN does not understand those custom variants, so enforce the
   layout with attribute selectors for Render. This fixes the side-by-side tab
   issue seen in Accounting, HR & Payroll, Employees and other operational pages. */
[data-slot="tabs"] { display: flex; flex-direction: column; gap: 1rem; width: 100%; min-width: 0; }
[data-slot="tabs"][data-orientation="vertical"] { flex-direction: row; align-items: flex-start; }
[data-slot="tabs-list"] {
  display: inline-flex; flex: 0 0 auto; align-items: center; justify-content: flex-start; gap: .25rem;
  max-width: 100%; overflow-x: auto; overflow-y: hidden; white-space: nowrap;
  border-radius: .75rem; background: var(--muted, #f1f5f9); padding: .25rem;
}
[data-slot="tabs-content"] { display: block; flex: 1 1 auto; width: 100%; min-width: 0; outline: none; }
[data-slot="tabs-content"][hidden], [hidden] { display: none !important; }
[data-slot="tabs-trigger"] {
  appearance: none; border: 1px solid transparent; background: transparent; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: .375rem;
  border-radius: .5rem; padding: .375rem .75rem; min-height: 2rem;
  font-size: .875rem; font-weight: 600; line-height: 1.25rem; white-space: nowrap;
  color: var(--muted-foreground, #64748b);
}
[data-slot="tabs-trigger"][data-active],
[data-slot="tabs-trigger"][data-state="active"],
[data-slot="tabs-trigger"][aria-selected="true"] {
  background: var(--background, #fff); color: var(--foreground, #111827); box-shadow: 0 1px 2px rgba(15,23,42,.08);
}
[data-slot="avatar"] { display: inline-flex; align-items: center; justify-content: center; overflow: hidden; border-radius: 9999px; }
[data-slot="avatar-image"] { width: 100%; height: 100%; object-fit: cover; }
[data-slot="avatar-fallback"] { display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; background: var(--muted, #f1f5f9); color: var(--muted-foreground, #64748b); }
`.trim();
}

function renderTailwindConfigScript() {
  return `<script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
          colors: {
            background: 'var(--background)', foreground: 'var(--foreground)',
            card: 'var(--card)', 'card-foreground': 'var(--card-foreground)',
            popover: 'var(--popover)', 'popover-foreground': 'var(--popover-foreground)',
            primary: 'var(--primary)', 'primary-foreground': 'var(--primary-foreground)',
            secondary: 'var(--secondary)', 'secondary-foreground': 'var(--secondary-foreground)',
            muted: 'var(--muted)', 'muted-foreground': 'var(--muted-foreground)',
            accent: 'var(--accent)', 'accent-foreground': 'var(--accent-foreground)',
            destructive: 'var(--destructive)', border: 'var(--border)', input: 'var(--input)', ring: 'var(--ring)',
            sidebar: 'var(--sidebar)', 'sidebar-foreground': 'var(--sidebar-foreground)',
            'sidebar-primary': 'var(--sidebar-primary)', 'sidebar-primary-foreground': 'var(--sidebar-primary-foreground)',
            'sidebar-accent': 'var(--sidebar-accent)', 'sidebar-accent-foreground': 'var(--sidebar-accent-foreground)',
            'sidebar-border': 'var(--sidebar-border)', 'sidebar-ring': 'var(--sidebar-ring)',
            chart: { 1: 'var(--chart-1)', 2: 'var(--chart-2)', 3: 'var(--chart-3)', 4: 'var(--chart-4)', 5: 'var(--chart-5)' }
          },
          borderRadius: {
            sm: 'calc(var(--radius) * 0.6)', md: 'calc(var(--radius) * 0.8)', lg: 'var(--radius)',
            xl: 'calc(var(--radius) * 1.4)', '2xl': 'calc(var(--radius) * 1.8)', '3xl': 'calc(var(--radius) * 2.2)', '4xl': 'calc(var(--radius) * 2.6)'
          },
          boxShadow: { soft: '0 1px 2px rgba(15,23,42,.04)', panel: '0 12px 40px rgba(15,23,42,.08)' }
        }
      }
    };
  </script>`;
}

const extensionCandidates = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'];
const indexCandidates = ['index.ts', 'index.tsx', 'index.js', 'index.jsx', 'index.mjs', 'index.cjs'];

function resolveLikeVite(importPath, resolveDir = root) {
  const basePath = path.isAbsolute(importPath) ? importPath : path.join(resolveDir, importPath);

  for (const ext of extensionCandidates) {
    const candidate = `${basePath}${ext}`;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  if (fs.existsSync(basePath) && fs.statSync(basePath).isDirectory()) {
    for (const indexFile of indexCandidates) {
      const candidate = path.join(basePath, indexFile);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }
  }

  return basePath;
}

const aliasPlugin = {
  name: 'powergym-render-alias',
  setup(build) {
    build.onResolve({ filter: /^@\/(.*)$/ }, args => ({
      path: resolveLikeVite(path.join(root, 'src', args.path.slice(2))),
    }));
    build.onResolve({ filter: /^firebase\/firestore$/ }, () => ({
      path: path.join(root, 'src', 'lib', 'firestore-sql-shim.ts'),
    }));
    build.onResolve({ filter: /\.css$/ }, args => ({
      path: path.isAbsolute(args.path) ? args.path : resolveLikeVite(args.path, args.resolveDir),
      namespace: 'ignore-css',
    }));
    build.onLoad({ filter: /.*/, namespace: 'ignore-css' }, () => ({
      contents: '',
      loader: 'css',
    }));
  },
};

console.log('Building low-memory Render client bundle with esbuild...');
rmrf(dist);
fs.mkdirSync(assets, { recursive: true });
copyDir(path.join(root, 'public'), dist);

await esbuild.build({
  entryPoints: [path.join(root, 'src', 'main.render.tsx')],
  bundle: true,
  outfile: path.join(assets, 'app.js'),
  format: 'esm',
  platform: 'browser',
  target: ['es2020'],
  jsx: 'automatic',
  sourcemap: false,
  minify: false,
  legalComments: 'none',
  logLevel: 'info',
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.env.GEMINI_API_KEY': JSON.stringify(process.env.GEMINI_API_KEY || ''),
    'global': 'window',
  },
  plugins: [aliasPlugin],
});

fs.writeFileSync(path.join(assets, 'render-fallback.css'), extractThemeCss(), 'utf8');
fs.writeFileSync(path.join(dist, 'index.html'), `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#2b2b2b" />
    <meta name="description" content="PowerGym Management system" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="icon" href="/icon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/assets/render-fallback.css" />
    ${renderTailwindConfigScript()}
    <script src="https://cdn.tailwindcss.com"></script>
    <title>PowerGym Management</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/app.js"></script>
  </body>
</html>
`, 'utf8');

console.log('Building production server bundle...');
await esbuild.build({
  entryPoints: [path.join(root, 'server.ts')],
  bundle: true,
  outfile: path.join(dist, 'server.cjs'),
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  sourcemap: false,
  target: ['node22'],
  logLevel: 'info',
});

console.log('Render low-memory build completed successfully.');
