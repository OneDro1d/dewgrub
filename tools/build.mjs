// Joins the source modules into one self-contained file, dist/index.html. No dependencies.
// Usage: node tools/build.mjs           write dist/index.html
//        node tools/build.mjs --check   fail if dist/index.html is not what the source builds to
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (name) => readFileSync(join(root, 'src', name), 'utf8');

// Order matters: a module comes after the modules it imports.
const MODULES = ['game.js', 'font.js', 'sounds.js', 'input.js', 'audio.js', 'render.js', 'main.js'];

function inline(name) {
  const code = src(name)
    .replace(/^import\s[\s\S]*?from\s+'[^']+';\n/gm, '')
    .replace(/^export\s+/gm, '');
  if (/^\s*(import|export)\s/m.test(code)) throw new Error(`${name}: an import or export line was not understood`);
  return `// ---- ${name} ----\n${code}`;
}

const js = `\n(function () {\n'use strict';\n${MODULES.map(inline).join('\n')}\n})();\n`;
const css = `\n${src('style.css')}`;
const hash = (text) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;
// Nothing may be loaded or contacted. Only this exact script and this exact style sheet may run.
const csp = `default-src 'none'; script-src ${hash(js)}; style-src ${hash(css)}; img-src data:; base-uri 'none'; form-action 'none'`;

const html = src('index.template.html')
  .replace('__CSP__', () => csp)
  .replace('__CSS__', () => css)
  .replace('__JS__', () => js);

const out = join(root, 'dist', 'index.html');
if (process.argv.includes('--check')) {
  if (!existsSync(out) || readFileSync(out, 'utf8') !== html) {
    console.error('dist/index.html is out of date: run "node tools/build.mjs" and commit the result');
    process.exit(1);
  }
  console.log(`dist/index.html is up to date with src/ (${html.length} bytes)`);
} else {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  console.log(`wrote dist/index.html (${html.length} bytes)`);
}
