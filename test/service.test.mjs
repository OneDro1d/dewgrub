// Tests for tools/serve.mjs, the local HTTP service around the game logic. Written before the service.
// Each test name starts with the requirement id it proves (docs/REQUIREMENTS.md, rules R-S*).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createGame, start, turn, step, stateHash, snapshot, encodeLog } from '../src/game.js';
import { chooseDir } from '../tools/bot.mjs';
import { createApp, LIMITS, ERROR_CODES, DEFAULT_PORT } from '../tools/serve.mjs';
import * as service from '../tools/serve.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIELDS = ['seed', 'status', 'cause', 'score', 'dew', 'spores', 'length', 'ticks', 'hash'];
// R-S10, the numbers of the rule itself: an error body and a log line are at most 512 bytes, and a value the
// caller sent is shown up to 40 characters.
const MAX_ERROR_BYTES = 512;
const MAX_QUOTED = 40;

let server;
let base;
const lines = []; // the service's log lines, as objects
const rawLines = []; // the same lines, as the text the service wrote

before(async () => {
  server = createApp({
    log: (line) => { rawLines.push(line); lines.push(JSON.parse(line)); },
    extraApi: {
      // A route that fails inside the service, to see what a fault of the service itself looks like from outside.
      '/api/test-fault': async () => { throw new Error('deliberate fault inside the service'); },
      // A route that refuses with a far too long message, to see the last guard on the size of an error body.
      '/api/test-long-refusal': async () => { throw new service.Refusal(400, 'bad_body', 'long '.repeat(2000)); },
    },
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((done) => server.close(done)));

async function call(path, body, { method = 'POST', headers = {}, raw } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: method === 'GET' || method === 'HEAD' ? undefined : raw !== undefined ? raw : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
  return { status: res.status, headers: res.headers, text, json };
}

// A whole game by the scripted player, straight from the logic: the reference the service must agree with.
function botGame(seed, maxTicks = 300) {
  const g = createGame(seed);
  start(g);
  while (g.status === 'playing' && g.tick < maxTicks) {
    const d = chooseDir(snapshot(g));
    if (d !== g.dir) turn(g, d);
    step(g);
  }
  return g;
}

test('R-S1 the service imports the game logic the page is built from, and holds no copy of the rules', () => {
  const src = readFileSync(join(root, 'tools', 'serve.mjs'), 'utf8');
  assert.match(src, /from '\.\.\/src\/game\.js'/);
  for (const own of ['function createGame', 'function step', 'function turn', 'function stateHash', 'mulberry', '0x6d2b79f5']) {
    assert.ok(!src.includes(own), `tools/serve.mjs has its own "${own}"`);
  }
});

test('R-S1 for 40 seeded games the service ends in the same state as the logic', async () => {
  for (let seed = 1; seed <= 40; seed++) {
    const g = botGame(seed);
    const r = await call('/api/step', { seed, log: encodeLog(g.log), ticks: g.tick });
    assert.equal(r.status, 200);
    assert.equal(r.json.hash, stateHash(g), `seed ${seed}`);
    assert.deepEqual(
      [r.json.status, r.json.cause, r.json.score, r.json.dew, r.json.spores, r.json.length, r.json.ticks],
      [g.status, g.cause, g.score, g.dewEaten, g.sporesEaten, g.grub.length, g.tick], `seed ${seed}`);
  }
});

test('R-S2 replay answers with exactly the documented fields', async () => {
  const r = await call('/api/replay', { seed: 123, log: '0D.7R' });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /^application\/json/);
  assert.deepEqual(Object.keys(r.json).sort(), [...FIELDS].sort());
  assert.equal(r.json.seed, 123);
  assert.match(r.json.hash, /^[0-9a-f]{8}$/);
});

test('R-S2 replay runs the log to its end and says when the game is still running', async () => {
  // Seed 123: the first dew is 7 cells right and 7 down of the head (checked by hand by the acceptance checker).
  // "0D.7R" turns down at tick 0 and right at tick 7. The log ends one tick after its last turn: tick 8.
  const r = await call('/api/replay', { seed: 123, log: '0D.7R' });
  assert.deepEqual([r.json.status, r.json.cause, r.json.ticks, r.json.score, r.json.length], ['playing', null, 8, 0, 3]);
  const empty = await call('/api/replay', { seed: 123, log: '' });
  assert.deepEqual([empty.json.status, empty.json.ticks, empty.json.score], ['playing', 0, 0]);
});

test('R-S2 replay stops at game over when the log runs into it', async () => {
  // Up at tick 0 from the middle row: the wall is hit on tick 11. The turn logged at tick 40 is never reached.
  const r = await call('/api/replay', { seed: 123, log: '0U.14L' });
  assert.deepEqual([r.json.status, r.json.cause, r.json.ticks, r.json.score], ['over', 'wall', 11, 0]);
});

test('R-S2 replay with finish:true goes on straight to game over, as the page replay does', async () => {
  // The acceptance checker's own hand-made logs for seed 123 and what the page scored for them.
  for (const [log, score] of [['0D.7R', 10], ['1D.8R', 10], ['7D', 10], ['0D.6R', 0], ['0D.8R', 0], ['0D.5R', 0], ['6D', 0], ['8D', 0]]) {
    const r = await call('/api/replay', { seed: 123, log, finish: true });
    assert.equal(r.status, 200);
    assert.deepEqual([r.json.status, r.json.cause, r.json.score], ['over', 'wall', score], log);
  }
});

test('R-S3 step answers after exactly n ticks, with the state a player needs', async () => {
  const r = await call('/api/step', { seed: 123, log: '', ticks: 0 });
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.json).sort(), [...FIELDS, 'state'].sort());
  assert.deepEqual(Object.keys(r.json.state).sort(), ['cols', 'dew', 'dir', 'grub', 'rows', 'spore']);
  assert.deepEqual(r.json.state, {
    cols: 20, rows: 20, dir: 'R',
    grub: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }],
    dew: { x: 17, y: 17 }, spore: null,
  });
  assert.deepEqual([r.json.status, r.json.ticks, r.json.length], ['playing', 0, 3]);

  const three = await call('/api/step', { seed: 123, log: '0D', ticks: 3 });
  assert.deepEqual(three.json.state.grub, [{ x: 10, y: 13 }, { x: 10, y: 12 }, { x: 10, y: 11 }]);
  assert.deepEqual([three.json.state.dir, three.json.ticks], ['D', 3]);
});

test('R-S3 step does not apply turns logged at tick n or later', async () => {
  const a = await call('/api/step', { seed: 123, log: '0D', ticks: 5 });
  const b = await call('/api/step', { seed: 123, log: '0D.5R.9U', ticks: 5 });
  assert.equal(b.json.hash, a.json.hash);
  const c = await call('/api/step', { seed: 123, log: '0D.4R', ticks: 5 });
  assert.notEqual(c.json.hash, a.json.hash);
  assert.equal(c.json.state.dir, 'R');
});

test('R-S3 step stops at game over and reports the tick it happened on', async () => {
  const r = await call('/api/step', { seed: 123, log: '0U', ticks: 500 });
  assert.deepEqual([r.json.status, r.json.cause, r.json.ticks], ['over', 'wall', 11]);
  assert.deepEqual(r.json.state.grub[0], { x: 10, y: 0 });
});

test('R-S3 step shows the spore with its ticks left', async () => {
  // Find, from the logic, a scripted game and a tick where a spore is on the board.
  let found = null;
  for (let seed = 1; seed <= 60 && !found; seed++) {
    const g = createGame(seed);
    start(g);
    while (g.status === 'playing' && g.tick < 300) {
      const d = chooseDir(snapshot(g));
      if (d !== g.dir) turn(g, d);
      step(g);
      if (g.spore && g.status === 'playing') { found = { seed, log: encodeLog(g.log), ticks: g.tick, spore: { ...g.spore } }; break; }
    }
  }
  assert.ok(found, 'no scripted game with a spore in the first 60 seeds');
  const r = await call('/api/step', { seed: found.seed, log: found.log, ticks: found.ticks });
  assert.deepEqual(r.json.state.spore, { x: found.spore.x, y: found.spore.y, ticksLeft: found.spore.ttl });
});

test('R-S4 every malformed request gets 400 with its error code and a message', async () => {
  const big = 'x'.repeat(LIMITS.bodyBytes + 1);
  const cases = [
    ['bad_json', '/api/replay', { raw: '{"seed": 1, "log": ' }],
    ['bad_json', '/api/step', { raw: '' }],
    ['bad_body', '/api/replay', { raw: '[1, 2]' }],
    ['bad_body', '/api/replay', { raw: '"seed"' }],
    ['bad_body', '/api/replay', { raw: 'null' }],
    ['missing_field', '/api/replay', { body: { log: '' } }],
    ['missing_field', '/api/replay', { body: { seed: 1 } }],
    ['missing_field', '/api/step', { body: { seed: 1, log: '' } }],
    ['bad_seed', '/api/replay', { body: { seed: 1.5, log: '' } }],
    ['bad_seed', '/api/replay', { body: { seed: '123', log: '' } }],
    ['bad_seed', '/api/replay', { body: { seed: -1, log: '' } }],
    ['bad_seed', '/api/replay', { body: { seed: 4294967296, log: '' } }],
    ['bad_seed', '/api/replay', { body: { seed: null, log: '' } }],
    ['bad_seed', '/api/replay', { body: { seed: true, log: '' } }],
    ['bad_log', '/api/replay', { body: { seed: 1, log: '5R.3U' } }],
    ['bad_log', '/api/replay', { body: { seed: 1, log: 'up' } }],
    ['bad_log', '/api/replay', { body: { seed: 1, log: '0u' } }],
    ['bad_log', '/api/replay', { body: { seed: 1, log: 7 } }],
    ['bad_log', '/api/step', { body: { seed: 1, log: ['0U'], ticks: 1 } }],
    ['bad_ticks', '/api/step', { body: { seed: 1, log: '', ticks: -1 } }],
    ['bad_ticks', '/api/step', { body: { seed: 1, log: '', ticks: 2.5 } }],
    ['bad_ticks', '/api/step', { body: { seed: 1, log: '', ticks: '3' } }],
    ['bad_ticks', '/api/step', { body: { seed: 1, log: '', ticks: LIMITS.ticks + 1 } }],
    ['bad_finish', '/api/replay', { body: { seed: 1, log: '', finish: 'yes' } }],
    ['body_too_large', '/api/replay', { raw: `{"seed": 1, "log": "${big}"}` }],
  ];
  for (const [code, path, { body, raw }] of cases) {
    const r = await call(path, body, { raw });
    const label = `${code} ${path} ${raw !== undefined ? raw.slice(0, 30) : JSON.stringify(body)}`;
    assert.equal(r.status, 400, label);
    assert.deepEqual(Object.keys(r.json).sort(), ['error', 'message'], label);
    assert.equal(r.json.error, code, label);
    assert.ok(typeof r.json.message === 'string' && r.json.message.length > 5, label);
  }
  // Every documented code was exercised above or below, and no other code exists.
  const seen = new Set(cases.map((c) => c[0]));
  seen.add('not_found');
  seen.add('method_not_allowed');
  seen.add('internal_error'); // status 500, see the next test
  assert.deepEqual([...seen].sort(), [...ERROR_CODES].sort());
});

test('R-S4 a fault inside the service answers 500 internal_error, leaks nothing, and the service keeps serving', async () => {
  const good = await call('/api/replay', { seed: 5, log: '0U' });
  const r = await call('/api/test-fault', {}, { headers: { 'X-Request-Id': 'fault-1' } });
  assert.equal(r.status, 500);
  assert.deepEqual(Object.keys(r.json).sort(), ['error', 'message']);
  assert.equal(r.json.error, 'internal_error');
  assert.ok(!r.text.includes('deliberate fault'), 'the inner error text must not reach the caller');
  assert.equal(r.headers.get('x-request-id'), 'fault-1');
  assert.equal((await call('/api/replay', { seed: 5, log: '0U' })).text, good.text);
});

test('R-S4 the limits: the largest allowed ticks and body are accepted', async () => {
  assert.deepEqual(LIMITS, { ticks: 100000, bodyBytes: 65536 });
  const ok = await call('/api/step', { seed: 1, log: '', ticks: LIMITS.ticks });
  assert.equal(ok.status, 200);
  const pad = ' '.repeat(LIMITS.bodyBytes - '{"seed":1,"log":""}'.length);
  const full = await call('/api/replay', null, { raw: `{"seed":1,"log":""${pad}}` });
  assert.equal(full.status, 200);
});

test('R-S4 a malformed request changes nothing: the same good request answers the same before and after', async () => {
  const good = { seed: 77, log: '0U.3L.6D', ticks: 9 };
  const before1 = await call('/api/step', good);
  await call('/api/step', { seed: 77, log: '0U.3L.6D', ticks: -5 });
  await call('/api/replay', null, { raw: '{{{' });
  await call('/api/step', { seed: 78, log: '0D', ticks: 40 });
  const after1 = await call('/api/step', good);
  assert.equal(after1.text, before1.text);
});

test('R-S5 unknown paths get 404 and wrong methods get 405, both as JSON errors', async () => {
  for (const [path, method] of [['/api/nothing', 'POST'], ['/api', 'GET'], ['/nothing.html', 'GET'], ['/api/replay/extra', 'POST'], ['/../package.json', 'GET'], ['/%2e%2e/README.md', 'GET'],
    // An encoded slash is not a path separator to the URL parser, so these reach the file lookup as "../README.md".
    ['/..%2fREADME.md', 'GET'], ['/%2e%2e%2fREADME.md', 'GET'], ['/..%2fdocs%2fAPI.md', 'GET'], ['/..%2fsrc%2fgame.js', 'GET'], ['/..%2f..%2f..%2fetc%2fhostname', 'GET'], ['/%', 'GET']]) {
    const r = await call(path, {}, { method });
    assert.equal(r.status, 404, `${method} ${path}`);
    assert.equal(r.json.error, 'not_found');
  }
  for (const [path, method, allow] of [['/api/replay', 'GET', 'POST'], ['/api/step', 'PUT', 'POST'], ['/api/step', 'DELETE', 'POST'], ['/', 'POST', 'GET, HEAD'], ['/index.html', 'DELETE', 'GET, HEAD']]) {
    const r = await call(path, {}, { method });
    assert.equal(r.status, 405, `${method} ${path}`);
    assert.equal(r.json.error, 'method_not_allowed');
    assert.equal(r.headers.get('allow'), allow);
  }
});

test('R-S6 the caller\'s X-Request-Id comes back, and an invalid or missing one is replaced', async () => {
  const mine = 'Run-42-abcDEF';
  const a = await call('/api/replay', { seed: 1, log: '' }, { headers: { 'X-Request-Id': mine } });
  assert.equal(a.headers.get('x-request-id'), mine);
  const longest = 'a'.repeat(64);
  assert.equal((await call('/api/replay', { seed: 1, log: '' }, { headers: { 'X-Request-Id': longest } })).headers.get('x-request-id'), longest);
  const made = new Set();
  for (const bad of [undefined, 'a'.repeat(65), 'has space', 'semi;colon', 'under_score', '']) {
    const headers = bad === undefined ? {} : { 'X-Request-Id': bad };
    const r = await call('/api/replay', { seed: 1, log: '' }, { headers });
    const id = r.headers.get('x-request-id');
    assert.match(id, /^[A-Za-z0-9-]{1,64}$/, `for ${JSON.stringify(bad)}`);
    assert.notEqual(id, bad);
    made.add(id);
  }
  assert.equal(made.size, 6, 'every generated id is different');
  // Errors and static files carry it too.
  assert.equal((await call('/api/step', {}, { headers: { 'X-Request-Id': 'e-1' } })).headers.get('x-request-id'), 'e-1');
  assert.equal((await call('/nope', null, { method: 'GET', headers: { 'X-Request-Id': 'e-2' } })).headers.get('x-request-id'), 'e-2');
  assert.equal((await call('/', null, { method: 'GET', headers: { 'X-Request-Id': 'e-3' } })).headers.get('x-request-id'), 'e-3');
});

test('R-S6 one JSON log line per request, with the id, the path, the status and the duration', async () => {
  lines.length = 0;
  await call('/api/replay?x=1', { seed: 1, log: '' }, { headers: { 'X-Request-Id': 'log-1' } });
  await call('/api/step', { seed: 1 }, { headers: { 'X-Request-Id': 'log-2' } });
  await call('/missing', null, { method: 'GET', headers: { 'X-Request-Id': 'log-3' } });
  assert.equal(lines.length, 3);
  assert.deepEqual(lines.map((l) => [l.id, l.method, l.path, l.status]),
    [['log-1', 'POST', '/api/replay', 200], ['log-2', 'POST', '/api/step', 400], ['log-3', 'GET', '/missing', 404]]);
  for (const l of lines) {
    assert.ok(typeof l.ms === 'number' && l.ms >= 0 && l.ms < 5000);
    assert.ok(!Number.isNaN(Date.parse(l.time)));
  }
});

test('R-S7 stateless: the same request gives the same body, alone, repeated and among 60 concurrent others', async () => {
  const req = { seed: 2026, log: '0U.4R.9D.12L', ticks: 30 };
  const first = await call('/api/step', req);
  const crowd = [];
  for (let i = 0; i < 60; i++) {
    crowd.push(i % 3 === 0 ? call('/api/step', req) : call('/api/replay', { seed: i, log: '0D.3L', finish: i % 2 === 0 }));
  }
  const answers = await Promise.all(crowd);
  for (let i = 0; i < 60; i += 3) assert.equal(answers[i].text, first.text);
  assert.equal((await call('/api/step', req)).text, first.text);
  // Key order is fixed too: the body is byte for byte the same, not just equal as JSON.
  assert.deepEqual(Object.keys(first.json), [...FIELDS, 'state']);
});

test('R-S8 the page is served at / exactly as built, and nothing outside dist/ is served', async () => {
  const built = readFileSync(join(root, 'dist', 'index.html'), 'utf8');
  for (const path of ['/', '/index.html', '/?seed=123&replay=0D.7R']) {
    const r = await call(path, null, { method: 'GET' });
    assert.equal(r.status, 200, path);
    assert.match(r.headers.get('content-type'), /^text\/html/);
    assert.equal(r.text, built, path);
  }
  const head = await call('/', null, { method: 'HEAD' });
  assert.deepEqual([head.status, head.text], [200, '']);
  assert.equal(server.address().address, '127.0.0.1');
  assert.equal(DEFAULT_PORT, 8787);
});

test('R-S8 started as a program it listens on 127.0.0.1 and the port from PORT, logs to stdout and stops on SIGTERM', async () => {
  const child = spawn('node', [join(root, 'tools', 'serve.mjs')], { env: { ...process.env, PORT: '0' } });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  const exited = new Promise((done) => child.on('exit', (code, signal) => done({ code, signal })));
  let score;
  try {
    const firstLine = await new Promise((done, fail) => {
      const timer = setTimeout(() => fail(new Error(`no start line: ${out}`)), 10000);
      child.stdout.on('data', () => { if (out.includes('\n')) { clearTimeout(timer); done(JSON.parse(out.split('\n')[0])); } });
    });
    assert.equal(firstLine.event, 'listening');
    assert.equal(firstLine.host, '127.0.0.1');
    assert.ok(Number.isInteger(firstLine.port) && firstLine.port > 0);
    const res = await fetch(`http://127.0.0.1:${firstLine.port}/api/replay`, {
      method: 'POST', headers: { 'X-Request-Id': 'cli-1' }, body: JSON.stringify({ seed: 123, log: '0D.7R', finish: true }),
    });
    score = (await res.json()).score;
  } finally {
    child.kill('SIGTERM'); // whatever happened above, the service must not be left running
  }
  const end = await exited;
  assert.equal(score, 10);
  assert.ok(end.code === 0 || end.signal === 'SIGTERM', JSON.stringify(end));
  const logged = out.trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(logged.filter((l) => l.id === 'cli-1').map((l) => [l.path, l.status]), [['/api/replay', 200]]);
});

test('R-S9 docs/API.md names every error code, both limits, and a curl example for each endpoint', () => {
  const doc = readFileSync(join(root, 'docs', 'API.md'), 'utf8');
  for (const code of ERROR_CODES) assert.ok(doc.includes(`\`${code}\``), `docs/API.md does not name ${code}`);
  assert.ok(doc.includes(String(LIMITS.ticks)), 'the ticks limit is not in the doc');
  assert.ok(doc.includes(String(LIMITS.bodyBytes)), 'the body limit is not in the doc');
  for (const path of ['/api/replay', '/api/step']) {
    assert.match(doc, new RegExp(`curl[^\\n]*${path}`), `no curl example for ${path}`);
  }
});

// ---- R-S10 (added in v7): no error body and no log line grows with what the caller sent ----

// A text of exactly `bytes` bytes: head, then `unit` repeated, then tail.
function sized(head, unit, tail, bytes = LIMITS.bodyBytes) {
  const room = bytes - Buffer.byteLength(head + tail);
  const text = head + unit.repeat(Math.floor(room / Buffer.byteLength(unit))) + tail;
  return text + ' '.repeat(bytes - Buffer.byteLength(text));
}

test('R-S10 on every error path, with the largest input, the error body and the log line stay within 512 bytes', async () => {
  const q = (unit) => sized('{"seed":1,"log":"', unit, '"}');
  // [expected code, expected status, path, method, body as sent, a piece of the input 41 characters long]
  // The piece must be absent from the message and from the logged path: 40 characters may be shown, 41 never.
  const cases = [
    ['bad_log', 400, '/api/replay', 'POST', q('x'), 'x'.repeat(41)],
    ['bad_log', 400, '/api/replay', 'POST', q('zz.'), 'zz.'.repeat(14).slice(0, 41)],
    ['bad_log', 400, '/api/replay', 'POST', `{"seed":1,"log":"5R.${'3'.repeat(60000)}U"}`, '3'.repeat(41)],
    ['bad_log', 400, '/api/replay', 'POST', `{"seed":1,"log":"5R.${'2'.repeat(60000)}"}`, '2'.repeat(41)],
    // 42 here, not 41: the message puts its own quotation mark in front of the 40 it shows.
    ['bad_log', 400, '/api/replay', 'POST', q('\\"'), '"'.repeat(42)],
    ['bad_log', 400, '/api/replay', 'POST', q('\\u0001'), '\u0001'.repeat(41)],
    ['bad_log', 400, '/api/replay', 'POST', q('\u{1F600}'), '\u{1F600}'.repeat(21).slice(0, 41)],
    ['bad_log', 400, '/api/replay', 'POST', q('€'), '€'.repeat(41)],
    ['bad_log', 400, '/api/step', 'POST', sized('{"seed":1,"ticks":1,"log":["', 'y', '"]}'), 'y'.repeat(41)],
    ['bad_json', 400, '/api/replay', 'POST', 'j'.repeat(LIMITS.bodyBytes), 'j'.repeat(41)],
    ['bad_body', 400, '/api/replay', 'POST', sized('["', 'b', '"]'), 'b'.repeat(41)],
    ['missing_field', 400, '/api/replay', 'POST', sized('{"', 'k', '":1}'), 'k'.repeat(41)],
    ['bad_seed', 400, '/api/replay', 'POST', sized('{"log":"","seed":"', 's', '"}'), 's'.repeat(41)],
    ['bad_ticks', 400, '/api/step', 'POST', sized('{"seed":1,"log":"","ticks":"', 't', '"}'), 't'.repeat(41)],
    ['bad_finish', 400, '/api/replay', 'POST', sized('{"seed":1,"log":"","finish":"', 'f', '"}'), 'f'.repeat(41)],
    ['body_too_large', 400, '/api/replay', 'POST', 'o'.repeat(LIMITS.bodyBytes + 1), 'o'.repeat(41)],
    ['body_too_large', 400, '/api/step', 'POST', 'o'.repeat(4 * LIMITS.bodyBytes), 'o'.repeat(41)],
    ['not_found', 404, `/api/${'n'.repeat(8000)}`, 'POST', q('x'), 'n'.repeat(41)],
    ['not_found', 404, `/${'m'.repeat(8000)}`, 'GET', undefined, 'm'.repeat(41)],
    ['not_found', 404, `/${'%E2%82%AC'.repeat(1500)}`, 'GET', undefined, '€'.repeat(41)],
    ['not_found', 404, `/${'%22'.repeat(3000)}`, 'GET', undefined, '"'.repeat(41)],
    ['not_found', 404, `/${'%01'.repeat(3000)}`, 'GET', undefined, '\u0001'.repeat(41)],
    ['not_found', 404, `/${'%F0%9F%98%80'.repeat(1000)}`, 'GET', undefined, '\u{1F600}'.repeat(21).slice(0, 41)],
    ['method_not_allowed', 405, '/api/replay', 'GET', undefined, null],
    // An encoded slash reaches the file lookup as a slash, so this long path is the page, asked for with POST.
    ['method_not_allowed', 405, `/${'a'.repeat(8000)}%2f..%2findex.html`, 'POST', q('x'), 'a'.repeat(41)],
    ['method_not_allowed', 405, `/${'%01'.repeat(3000)}%2f..%2findex.html`, 'DELETE', undefined, '\u0001'.repeat(41)],
    ['internal_error', 500, '/api/test-fault', 'POST', q('x'), 'x'.repeat(41)],
    ['bad_body', 400, '/api/test-long-refusal', 'POST', '{}', 'long '.repeat(9).slice(0, 41)],
  ];
  rawLines.length = 0;
  const seen = new Set();
  for (let i = 0; i < cases.length; i++) {
    const [code, status, path, method, raw, piece] = cases[i];
    const label = `case ${i}: ${code} ${method} ${path.slice(0, 30)}`;
    const id = `big-${i}`;
    const r = await call(path, null, { method, raw, headers: { 'X-Request-Id': id } });
    assert.equal(r.status, status, label);
    assert.ok(r.json, `${label}: the body is not JSON`);
    assert.equal(r.json.error, code, label);
    assert.deepEqual(Object.keys(r.json).sort(), ['error', 'message'], label);
    assert.ok(typeof r.json.message === 'string' && r.json.message.length > 5, label);
    const bytes = Buffer.byteLength(r.text);
    assert.ok(bytes <= MAX_ERROR_BYTES, `${label}: the error body is ${bytes} bytes`);
    if (piece) assert.ok(!r.json.message.includes(piece), `${label}: the message repeats 41 characters of the input`);
    const mine = rawLines.filter((l) => JSON.parse(l).id === id);
    assert.equal(mine.length, 1, `${label}: log lines`);
    const lineBytes = Buffer.byteLength(mine[0]);
    assert.ok(lineBytes <= MAX_ERROR_BYTES, `${label}: the log line is ${lineBytes} bytes`);
    if (piece) assert.ok(!JSON.parse(mine[0]).path.includes(piece), `${label}: the log line repeats 41 characters of the input`);
    assert.equal(JSON.parse(mine[0]).status, status, label);
    seen.add(code);
  }
  assert.deepEqual([...seen].sort(), [...ERROR_CODES].sort(), 'every error code has a largest-input case');
});

test('R-S10 a rejected value is quoted up to 40 characters, then "…", and a short one is quoted whole', async () => {
  assert.deepEqual(service.ERROR_LIMITS, { bodyBytes: MAX_ERROR_BYTES, quoted: MAX_QUOTED });
  const message = async (log) => (await call('/api/replay', { seed: 1, log })).json.message;
  const long = await message('a'.repeat(41));
  assert.ok(long.includes(`"${'a'.repeat(40)}…"`), long);
  assert.ok(!long.includes('a'.repeat(41)), long);
  const exact = await message('a'.repeat(40));
  assert.ok(exact.includes(`"${'a'.repeat(40)}"`), exact);
  assert.ok(!exact.includes('…'), exact);
  assert.ok((await message('up')).includes('"up"'));
  // The message names the entry the logic rejected, not the start of the log.
  const second = await message('5R.3U');
  assert.ok(second.includes('"3U"') && !second.includes('5R'), second);
  const far = await message(`0D.${'7R.'.repeat(500)}${'q'.repeat(300)}`);
  assert.ok(far.includes(`"${'q'.repeat(40)}…"`), far);
  // A path is cut the same way, in the message and in the log line.
  rawLines.length = 0;
  const r = await call(`/${'a'.repeat(100)}%2f..%2findex.html`, {}, { headers: { 'X-Request-Id': 'cut-1' } });
  assert.equal(r.status, 405);
  assert.ok(r.json.message.startsWith(`/${'a'.repeat(39)}… `), r.json.message);
  await call(`/${'n'.repeat(100)}`, null, { method: 'GET', headers: { 'X-Request-Id': 'cut-2' } });
  await call(`/${'n'.repeat(39)}`, null, { method: 'GET', headers: { 'X-Request-Id': 'cut-3' } });
  const paths = Object.fromEntries(rawLines.map((l) => JSON.parse(l)).map((l) => [l.id, l.path]));
  assert.deepEqual(paths, { 'cut-1': `/${'a'.repeat(39)}…`, 'cut-2': `/${'n'.repeat(39)}…`, 'cut-3': `/${'n'.repeat(39)}` });
});

test('R-S10 a refusal with a far too long message still answers within 512 bytes, with its code', async () => {
  const r = await call('/api/test-long-refusal', {});
  assert.equal(r.status, 400);
  assert.deepEqual(Object.keys(r.json).sort(), ['error', 'message']);
  assert.equal(r.json.error, 'bad_body');
  assert.ok(Buffer.byteLength(r.text) <= MAX_ERROR_BYTES, `${Buffer.byteLength(r.text)} bytes`);
  assert.ok(r.json.message.length > 5 && !r.json.message.includes('long long'), r.json.message);
});

test('R-S10 a wrong PORT is refused at the start with a short message, however long the value', async () => {
  const child = spawn('node', [join(root, 'tools', 'serve.mjs')], { env: { ...process.env, PORT: '9'.repeat(5000) } });
  let err = '';
  child.stderr.on('data', (d) => { err += d; });
  const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
  const code = await new Promise((done) => child.on('exit', done));
  clearTimeout(timer);
  assert.equal(code, 2);
  assert.ok(err.includes(`"${'9'.repeat(40)}…"`), err.slice(0, 200));
  assert.ok(Buffer.byteLength(err) <= MAX_ERROR_BYTES, `${Buffer.byteLength(err)} bytes on standard error`);
});

test('R-S10 docs/API.md states the 512-byte limit and the 40-character cut', () => {
  const doc = readFileSync(join(root, 'docs', 'API.md'), 'utf8');
  assert.match(doc, /at most \*\*512\*\* bytes/);
  assert.match(doc, /\*\*40\*\* characters/);
});
