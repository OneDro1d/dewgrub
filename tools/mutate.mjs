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
  ['a spore can land on the dew', 'if (g.dew) taken.add(g.dew.y * g.cols + g.dew.x);', ''],
  ['dew can land on the grub', 'const taken = new Set(g.grub.map((c) => c.y * g.cols + c.x));', 'const taken = new Set();'],
  ['a turn log with ticks going backwards is accepted', '!Number.isSafeInteger(t) || t < prev', '!Number.isSafeInteger(t)'],
  ['a big seed is not wrapped at 2^32', '% 4294967296n', '% 4294967295n'],
  ['the state hash ignores the score', 'g.status, g.cause, g.score, g.tick,', 'g.status, g.cause, g.tick,'],
  ['a full grid is not noticed', "if (!g.dew) return end(g, 'full', events);", ''],
  ['step reports no eat event', "events.push('eat');", ''],
  ['snapshot is not a copy', 'const copy = JSON.parse(JSON.stringify(g));', 'const copy = g;'],
  ['the error for a bad turn log does not name the rejected entry', '{ entry: part }', '{}'],
];

// [what is broken, text in tools/serve.mjs, replacement]
const SERVICE = [
  ['step plays one tick too many', 'g.tick < until', 'g.tick <= until'],
  ['replay stops on the last turn, not one tick after it', 'log[log.length - 1].t + 1', 'log[log.length - 1].t'],
  ['finish is ignored', 'if (finish) {', 'if (false) {'],
  ['a seed in a string is accepted', '!Number.isInteger(body.seed) ||', '!Number.isInteger(Number(body.seed)) ||'],
  ['a seed above 2^32 - 1 is accepted', ' || body.seed > 4294967295', ''],
  ['negative ticks are accepted', 'ticks < 0 || ', ''],
  ['there is no limit on ticks', ' || ticks > LIMITS.ticks', ''],
  ['a turn log the logic rejects is played as an empty log', "catch (e) { throw bad('bad_log', `the game logic rejects this turn log, at the entry \"${clip(e.entry)}\"`); }", 'catch (e) { log = []; }'],
  ['a missing field is taken as zero', "if (!Object.prototype.hasOwnProperty.call(body, field)) throw bad('missing_field', `the field \"${field}\" is missing`);", 'if (!Object.prototype.hasOwnProperty.call(body, field)) body[field] = field === \'log\' ? \'\' : 0;'],
  ['a JSON array is accepted as a body', ' || Array.isArray(body)', ''],
  ['the body size limit is not enforced', 'if (size > LIMITS.bodyBytes) {', 'if (false) {'],
  ['a wrong finish value is accepted', "if (body.finish !== undefined && typeof body.finish !== 'boolean') throw bad('bad_finish', 'finish must be true or false');", ''],
  ['the caller\'s request id is not sent back', "'X-Request-Id': id, ...out.headers,", "'X-Request-Id': randomUUID(), ...out.headers,"],
  ['any text is accepted as a request id', '/^[A-Za-z0-9-]{1,64}$/.test(sent)', 'sent.length > 0'],
  ['GET on an API path is not refused', "if (req.method !== 'POST') throw new Refusal(405, 'method_not_allowed', `${path} takes POST`, { Allow: 'POST' });", ''],
  ['POST on the page is not refused', "if (req.method !== 'GET' && req.method !== 'HEAD') {", 'if (false) {'],
  ['the log line carries the query string', 'method: req.method, path: clip(path), status: out.status', 'method: req.method, path: clip(req.url), status: out.status'],
  ['the log line has no duration', ', ms: Math.round(ms * 1000) / 1000 }', ' }'],
  ['the spore\'s ticks left are not reported', 'ticksLeft: g.spore.ttl', 'ticksLeft: 0'],
  ['score reports the dew count', 'score: g.score, dew: g.dewEaten', 'score: g.dewEaten, dew: g.dewEaten'],
  ['step leaves out the state', 'return { ...summary(g), state: playerState(g) };', 'return summary(g);'],
  ['files outside dist/ can be read', "if (wanted !== distDir && !wanted.startsWith(distDir + sep)) throw new Refusal(404, 'not_found', 'no such path');", ''],
  ['the service remembers the last game', 'const g = createGame(seed);\n  start(g);\n  const until', 'const g = (play.last = play.last || createGame(seed));\n  start(g);\n  const until'],
  ['a service fault takes the whole service down', "const r = e instanceof Refusal ? e : new Refusal(500, 'internal_error', 'the service failed on this request');", 'if (!(e instanceof Refusal)) throw e;\n      const r = e;'],
  // v7, rule R-S10: no error grows with the input.
  ['the error message repeats the whole rejected entry', 'at the entry "${clip(e.entry)}"', 'at the entry "${e.entry}"'],
  ['the error message shows the start of the log, not the rejected entry', 'at the entry "${clip(e.entry)}"', 'at the entry "${clip(body.log)}"'],
  ['a value is cut after 80 characters, not 40', 'bodyBytes: 512, quoted: 40 }', 'bodyBytes: 512, quoted: 80 }'],
  ['an error body may be 2048 bytes', 'bodyBytes: 512, quoted: 40 }', 'bodyBytes: 2048, quoted: 40 }'],
  ['a cut value does not end in "…"', '${text.slice(0, ERROR_LIMITS.quoted)}…`', '${text.slice(0, ERROR_LIMITS.quoted)}`'],
  ['the last guard on the size of an error body is missing', 'if (Buffer.byteLength(body) > ERROR_LIMITS.bodyBytes) body = ', 'if (false) body = '],
  ['the 405 message repeats the whole path', '`${clip(path)} takes GET or HEAD`', '`${path} takes GET or HEAD`'],
  ['the log line carries the whole path', 'path: clip(path), status', 'path, status'],
  ['the message for a wrong PORT repeats the whole value', 'not "${clip(process.env.PORT)}"', 'not "${process.env.PORT}"'],
];

// [what is broken, text in tools/jev-player.mjs, replacement]
const JEV_PLAYER = [
  ['a 429 is not retried', 'if (r.status === 429 || r.status === 529) {', 'if (r.status === 529) {'],
  ['a 529 is not retried', 'if (r.status === 429 || r.status === 529) {', 'if (r.status === 429) {'],
  ['four retries instead of three', 'export const MAX_RETRIES = 3;', 'export const MAX_RETRIES = 4;'],
  ['retries are not counted in the budget', 'if (!budget.take()) return null;', 'if (attempt === 1 && !budget.take()) return null;'],
  ['the wait between retries does not grow', 'await sleep(BACKOFF_MS * 2 ** (attempt - 1));', 'await sleep(BACKOFF_MS);'],
  ['a 401 is not recognised', "if (r.status === 401) throw new JevError('unauthorized', 'the model refused the credential (status 401)', 401);", ''],
  ['a choice outside the three moves is accepted', '!MOVES.includes(a.choice)', 'a.choice === undefined'],
  ['a timeout is reported as something else', "if (r.failure === 'timeout') throw new JevError('timeout', `no answer within ${timeoutMs} ms`, 0);", ''],
  ['the response time is not recorded', 'ms += r.ms;', ''],
  ['the budget does not stop anything', 'if (this.left <= 0) return false;', ''],
  ['a game budget does not spend from the total budget', 'if (this.parent) this.parent.take();', ''],
  ['the key is written to the run record', 'seed: game.seed, model: JEV_MODEL, maxCalls,', 'seed: game.seed, key, model: JEV_MODEL, maxCalls,'],
  ['the key is printed', 'console.log(`run record: ${file}`);', 'console.log(`run record: ${file} ${key}`);'],
  ['the player runs without a key', 'if (!key) {', 'if (false) {'],
  ['the record leaves out the replay address', 'length: game.length, hash: game.hash, log: game.log, replay,', 'length: game.length, hash: game.hash, log: game.log,'],
  ['a failed run exits with code 0', "process.exit(game.stoppedBy === 'error' ? 1 : 0);", 'process.exit(0);'],
  ['the default budget is 3000 calls', 'export const DEFAULT_MAX_CALLS = 300;', 'export const DEFAULT_MAX_CALLS = 3000;'],
];
const JEV_TRANSPORT = [
  ['the key is sent without the Bearer scheme', 'Authorization: `Bearer ${key}`', 'Authorization: key'],
  ['the question is left out of the request', 'body: JSON.stringify({ state, model, questions }),', 'body: JSON.stringify({ state, model }),'],
  ['there is no time limit on a request', 'const timer = setTimeout(() => stop.abort(), timeoutMs);', 'const timer = setTimeout(() => {}, timeoutMs);'],
  ['the request goes out as a GET', "method: 'POST',", "method: 'PUT',"],
];
const PLAYERS = [
  ['left and right are swapped', "if (move === 'left') return TO_LEFT[heading];", "if (move === 'left') return TO_RIGHT[heading];"],
  ['the view calls a wall nothing', "hits = 'wall';", "hits = 'nothing';"],
  ['the view calls the body nothing', "hits = 'body';", "hits = 'nothing';"],
  ['the tick cap is ignored', "if (g.tick >= maxTicks) { stoppedBy = 'cap'; break; }", ''],
  ['an error of the model crashes the run instead of ending it', "stoppedBy = 'error';", "throw e;"],
  ['the random player ignores its seed', 'let r = (Math.imul(seed >>> 0, 2654435761) ^ 0x9e3779b9) >>> 0;', 'let r = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;'],
];
const BENCH = [
  ['Jev is played without a key', "  if (key) {\n    const total", "  if (true) {\n    const total"],
  ['the median is the mean', 'medianScore: median(games.map((g) => g.score))', 'medianScore: round(mean(games.map((g) => g.score)))'],
  ['a capped game is counted as a death', "const cause = g.stoppedBy === 'over' ? g.cause : g.stoppedBy;", "const cause = g.cause || 'wall';"],
  ['the total budget is not checked between games', '      if (total.left <= 0) break;\n', ''],
  ['Jev gets its own seeds', "const game = await playGame(seed, decide, { maxTicks: Infinity });\n      if (game.stoppedBy === 'error')", "const game = await playGame(seed + 100, decide, { maxTicks: Infinity });\n      if (game.stoppedBy === 'error')"],
];

const GROUPS = [
  { name: 'game logic', file: 'src/game.js', tests: ['test/logic.test.mjs', 'test/presentation.test.mjs'], mutants: MUTANTS },
  { name: 'service', file: 'tools/serve.mjs', tests: ['test/service.test.mjs'], mutants: SERVICE },
  { name: 'Jev player', file: 'tools/jev-player.mjs', tests: ['test/jev.test.mjs'], mutants: JEV_PLAYER },
  { name: 'Jev transport', file: 'tools/jev-transport.mjs', tests: ['test/jev.test.mjs'], mutants: JEV_TRANSPORT },
  { name: 'players', file: 'tools/players.mjs', tests: ['test/jev.test.mjs'], mutants: PLAYERS },
  { name: 'benchmark', file: 'tools/bench.mjs', tests: ['test/jev.test.mjs'], mutants: BENCH },
];

// MUTATE_ONLY="service" (a group name, or several with commas) runs only those groups. Default: all.
const only = process.env.MUTATE_ONLY ? process.env.MUTATE_ONLY.split(',') : null;
let total = 0;
let survived = 0;
for (const group of GROUPS) {
  if (only && !only.includes(group.name)) continue;
  const original = readFileSync(join(root, group.file), 'utf8');
  for (const [what, find, put] of group.mutants) {
    total++;
    if (original.split(find).length !== 2) {
      console.error(`SETUP ERROR: ${JSON.stringify(find)} must occur exactly once in ${group.file}`);
      process.exit(2);
    }
    rmSync(work, { recursive: true, force: true });
    mkdirSync(work, { recursive: true });
    for (const dir of ['src', 'test', 'tools', 'docs', 'dist']) cpSync(join(root, dir), join(work, dir), { recursive: true });
    writeFileSync(join(work, group.file), original.replace(find, () => put));
    const run = spawnSync('node', ['--test', ...group.tests.map((t) => join(work, t))], { encoding: 'utf8', timeout: 120000 });
    const failed = (run.stdout.match(/^not ok \d+ - (R-\w+)/gm) || []).map((l) => l.replace(/^not ok \d+ - /, ''));
    if (run.status === 0) {
      survived++;
      console.log(`SURVIVED  [${group.name}] ${what}`);
    } else {
      console.log(`caught    [${group.name}] ${what}  <- ${[...new Set(failed)].join(' ') || 'run failed'}`);
    }
  }
}
rmSync(work, { recursive: true, force: true });
console.log(`${total - survived}/${total} deliberate faults were caught by the unit tests`);
if (survived) process.exit(1);

