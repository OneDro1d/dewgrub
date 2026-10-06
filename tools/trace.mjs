// Fails if a requirement id in docs/REQUIREMENTS.md is not named by any test.
// Usage: node tools/trace.mjs [--only=R-L]   (the prefix limits the check to one group of rules)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const only = (process.argv.find((a) => a.startsWith('--only=')) || '--only=R-').slice(7);

const reqText = readFileSync(join(root, 'docs/REQUIREMENTS.md'), 'utf8');
const ids = [...new Set(reqText.match(/^\| (R-[LPBSJR]\d+) /gm).map((m) => m.slice(2).trim()))]
  .filter((id) => id.startsWith(only));

let testText = '';
for (const dir of ['test', 'e2e']) {
  const p = join(root, dir);
  if (!existsSync(p)) continue;
  for (const f of readdirSync(p)) {
    if (/\.(mjs|py)$/.test(f)) testText += readFileSync(join(p, f), 'utf8');
  }
}

const missing = [];
for (const id of ids) {
  // An id counts only inside a test name: test('R-L1 ...') in Node, def test_R_L1_... in Python.
  const py = id.replace('-', '_');
  const n = (testText.match(new RegExp(`test\\('${id} |def test_${py}_`, 'g')) || []).length;
  console.log(`${id.padEnd(6)} ${String(n).padStart(2)} test(s)`);
  if (n === 0) missing.push(id);
}
console.log(`${ids.length - missing.length}/${ids.length} requirements (prefix ${only}) are named by a test`);
if (missing.length) {
  console.error(`NOT COVERED: ${missing.join(', ')}`);
  process.exit(1);
}
