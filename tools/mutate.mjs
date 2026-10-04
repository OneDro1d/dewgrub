// Do the unit tests bite? Break the game logic on purpose, one small change at a time, and demand that
// the unit tests fail every time. A change the tests do not notice is a hole in the tests.
// Usage: node tools/mutate.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const work = join(root, '.tmp', 'mutant');

// [what is broken, text in src/game.js, replacement]
const MUTANTS = [
  ['a reversal is accepted', "d === last || d === OPPOSITE[last] || ", 'd === last || '],
  ['a repeat of the direction is accepted', "d === last || d === OPPOSITE[last] || ", 'd === OPPOSITE[last] || '],
  ['three turns can wait', 'g.queue.length >= 2', 'g.queue.length >= 3'],
  ['a turn is checked against the current direction only', "g.queue.length ? g.queue[g.queue.length - 1] : g.dir", 'g.dir'],
  ['the right wall is one cell too far', 'head.x >= g.cols', 'head.x > g.cols'],
  ['the top wall is missing', 'head.y < 0 || ', ''],
  ['the tail cell counts as body', 'const body = grows ? g.grub : g.grub.slice(0, -1);', 'const body = g.grub;'],
  ['the body never kills', "if (body.some((c) => same(c, head))) return end(g, 'self', events);", ''],
  ['the grub never grows', 'if (!grows) g.grub.pop();', 'g.grub.pop();'],
  ['dew scores 11', 'g.score += DEW_POINTS;', 'g.score += DEW_POINTS + 1;'],
  ['a spore lives one tick longer', '--g.spore.ttl <= 0', '--g.spore.ttl < 0'],
  ['a spore on its last tick cannot be eaten', 'if (same(head, g.spore)) {', 'if (g.spore.ttl > 1 && same(head, g.spore)) {'],
  ['a second spore replaces the first', 'g.dewEaten % SPORE_EVERY === 0 && !g.spore', 'g.dewEaten % SPORE_EVERY === 0'],
  ['a spore comes after every 4th dew', 'export const SPORE_EVERY = 5;', 'export const SPORE_EVERY = 4;'],
  ['the speed floor is 60 ms', 'Math.max(70, 150', 'Math.max(60, 150'],
  ['turns are not logged', 'g.log.push({ t: g.tick, d });', ''],
  ['rejected turns are logged', "if (d === last", "g.log.push({ t: g.tick, d });\n  if (d === last"],
  ['the generator is stuck', 'g.rng = (g.rng + 0x6d2b79f5) >>> 0;', 'g.rng = 1;'],
  ['the grub moves before the game starts', "if (g.status !== 'playing') return events;", "if (g.status === 'over') return events;"],
  ['dew can land on the spore', 'if (g.spore) taken.add(g.spore.y * g.cols + g.spore.x);', ''],
  ['dew can land on the grub', 'const taken = new Set(g.grub.map((c) => c.y * g.cols + c.x));', 'const taken = new Set();'],
  ['a turn log with ticks going backwards is accepted', '!Number.isSafeInteger(t) || t < prev', '!Number.isSafeInteger(t)'],
  ['a big seed is not wrapped at 2^32', '% 4294967296n', '% 4294967295n'],
  ['the state hash ignores the score', 'g.status, g.cause, g.score, g.tick,', 'g.status, g.cause, g.tick,'],
  ['a full grid is not noticed', "if (!g.dew) return end(g, 'full', events);", ''],
  ['step reports no eat event', "events.push('eat');", ''],
  ['snapshot is not a copy', 'const copy = JSON.parse(JSON.stringify(g));', 'const copy = g;'],
];

const original = readFileSync(join(root, 'src', 'game.js'), 'utf8');
let survived = 0;
for (const [what, find, put] of MUTANTS) {
  if (original.split(find).length !== 2) {
    console.error(`SETUP ERROR: "${find}" must occur exactly once in src/game.js`);
    process.exit(2);
  }
  rmSync(work, { recursive: true, force: true });
  mkdirSync(join(work, 'tools'), { recursive: true });
  cpSync(join(root, 'src'), join(work, 'src'), { recursive: true });
  cpSync(join(root, 'test'), join(work, 'test'), { recursive: true });
  cpSync(join(root, 'tools', 'bot.mjs'), join(work, 'tools', 'bot.mjs'));
  writeFileSync(join(work, 'src', 'game.js'), original.replace(find, () => put));
  const run = spawnSync('node', ['--test', join(work, 'test')], { encoding: 'utf8', timeout: 120000 });
  const failed = (run.stdout.match(/^not ok \d+ - (R-\w+)/gm) || []).map((l) => l.replace(/^not ok \d+ - /, ''));
  if (run.status === 0) {
    survived++;
    console.log(`SURVIVED  ${what}`);
  } else {
    console.log(`caught    ${what}  <- ${[...new Set(failed)].join(' ') || 'run failed'}`);
  }
}
rmSync(work, { recursive: true, force: true });
console.log(`${MUTANTS.length - survived}/${MUTANTS.length} deliberate faults were caught by the unit tests`);
if (survived) process.exit(1);
