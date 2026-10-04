// Tests for the players and the Jev player (tools/players.mjs, tools/jev-transport.mjs, tools/jev-player.mjs,
// tools/bench.mjs). Written before the tools. The real Jev model is never called here: every request goes to a
// fake server started by this file. Each test name starts with the requirement id it proves (rules R-J*).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createGame, start, turn, step, stateHash, decodeLog } from '../src/game.js';
import { MOVES, applyMove, relativeMove, viewOf, playGame, randomPlayer, scriptedPlayer } from '../tools/players.mjs';
import { askJev, JEV_URL } from '../tools/jev-transport.mjs';
import { Budget, makeJevDecider, QUESTION, JevError, DEFAULT_MAX_CALLS } from '../tools/jev-player.mjs';
import { summarise } from '../tools/bench.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const KEY = 'test-key-not-a-real-one-7f3a9c';

// ---- the fake Jev server -------------------------------------------------------------------------------
let fake;
let fakeUrl;
let received = []; // { auth, body } of every request
let script = [];   // what to answer next; when empty, the default answer
const okBody = (choice, extra = {}) => ({
  model: 'jev-fake',
  answers: { move: { type: 'choice', choice, probabilities: { left: 0.1, straight: 0.8, right: 0.1 }, confidence: 0.8, ...extra } },
  usage: { input_tokens: 100, output_tokens: 5 },
});

before(async () => {
  fake = http.createServer((req, res) => {
    let text = '';
    req.on('data', (c) => { text += c; });
    req.on('end', () => {
      let body = null;
      try { body = JSON.parse(text); } catch (e) { /* keep null */ }
      received.push({ auth: req.headers.authorization, type: req.headers['content-type'], method: req.method, path: req.url, body });
      const next = script.length ? script.shift() : { choice: 'straight' };
      const send = () => {
        if (next.raw !== undefined) { res.writeHead(next.status || 200, { 'Content-Type': 'application/json' }); res.end(next.raw); return; }
        if (next.status && next.status !== 200) { res.writeHead(next.status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'fake' })); return; }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(next.body || okBody(typeof next.choice === 'function' ? next.choice(body) : next.choice)));
      };
      if (next.delayMs) setTimeout(send, next.delayMs); else send();
    });
  });
  await new Promise((done) => fake.listen(0, '127.0.0.1', done));
  fakeUrl = `http://127.0.0.1:${fake.address().port}/v1/systemone`;
});
after(() => new Promise((done) => { fake.closeAllConnections(); fake.close(done); }));
beforeEach(() => { received = []; script = []; });

const noSleep = async () => {};
const decider = (opts = {}) => makeJevDecider({ key: KEY, url: fakeUrl, sleep: noSleep, budget: new Budget(50), ...opts });

function run(args, env = {}) {
  return new Promise((done) => {
    const clean = { ...process.env };
    delete clean.TYPESAFE_API_KEY;
    delete clean.TYPESAFE_API_URL;
    const child = spawn('node', args, { env: { ...clean, ...env }, cwd: root });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('exit', (code) => done({ code, out, err }));
  });
}

// ---- the players, no model involved ----------------------------------------------------------------------

test('R-J1 a move is relative to the heading: left, straight, right', () => {
  assert.deepEqual(MOVES, ['left', 'straight', 'right']);
  const expected = { U: ['L', 'U', 'R'], R: ['U', 'R', 'D'], D: ['R', 'D', 'L'], L: ['D', 'L', 'U'] };
  for (const [heading, [left, straight, right]] of Object.entries(expected)) {
    for (const [move, dir] of [['left', left], ['straight', straight], ['right', right]]) {
      const g = createGame(1);
      start(g);
      g.dir = heading;
      applyMove(g, move);
      step(g);
      assert.equal(g.dir, dir, `${heading} + ${move}`);
      assert.equal(relativeMove(heading, dir), move);
    }
  }
  const g = createGame(1);
  start(g);
  assert.throws(() => applyMove(g, 'back'));
  assert.throws(() => relativeMove('U', 'D'));
});

test('R-J1 the view sent to a player describes the board and what each move runs into', () => {
  const g = createGame(123);
  start(g);
  const v = viewOf(g);
  assert.deepEqual(v.grid, { cols: 20, rows: 20 });
  assert.equal(v.heading, 'right');
  assert.deepEqual(v.head, { x: 10, y: 10 });
  assert.deepEqual(v.body, [{ x: 9, y: 10 }, { x: 8, y: 10 }]);
  assert.deepEqual(v.dew, { x: 17, y: 17 });
  assert.equal(v.spore, null);
  assert.deepEqual(Object.keys(v.moves), MOVES);
  assert.deepEqual(v.moves.left, { cell: { x: 10, y: 9 }, hits: 'nothing', dewDistance: 15 });
  assert.deepEqual(v.moves.straight, { cell: { x: 11, y: 10 }, hits: 'nothing', dewDistance: 13 });
  assert.deepEqual(v.moves.right, { cell: { x: 10, y: 11 }, hits: 'nothing', dewDistance: 13 });
  // Against the right wall, heading right: straight is the wall.
  g.grub = [{ x: 19, y: 5 }, { x: 18, y: 5 }, { x: 17, y: 5 }];
  assert.equal(viewOf(g).moves.straight.hits, 'wall');
  // Heading up with the body to the left of the head: left is the body.
  g.grub = [{ x: 5, y: 5 }, { x: 5, y: 6 }, { x: 4, y: 6 }, { x: 4, y: 5 }, { x: 4, y: 4 }];
  g.dir = 'U';
  assert.equal(viewOf(g).moves.left.hits, 'body');
  g.dew = { x: 5, y: 4 };
  assert.equal(viewOf(g).moves.straight.hits, 'dew');
  // The view is plain data: it survives JSON unchanged and holds no reference into the game.
  assert.deepEqual(JSON.parse(JSON.stringify(viewOf(g))), viewOf(g));
});

test('R-J2 playGame plays a seeded game with any decider and its turn log replays to the same state', async () => {
  for (const seed of [3, 4, 5]) {
    for (const make of [() => randomPlayer(seed), () => scriptedPlayer()]) {
      const r = await playGame(seed, make(), { maxTicks: 300 });
      assert.equal(r.seed, seed);
      assert.ok(['over', 'cap'].includes(r.stoppedBy));
      // Replay the log with the logic alone, for exactly r.ticks ticks.
      const g = createGame(seed);
      start(g);
      const log = decodeLog(r.log);
      let i = 0;
      while (g.status === 'playing' && g.tick < r.ticks) {
        while (i < log.length && log[i].t === g.tick) turn(g, log[i++].d);
        step(g);
      }
      assert.equal(stateHash(g), r.hash, `seed ${seed}`);
      assert.deepEqual([g.score, g.tick, g.cause], [r.score, r.ticks, r.cause]);
    }
  }
});

test('R-J2 the random player is seeded, and the scripted player outscores it over 30 seeds', async () => {
  const a = await playGame(9, randomPlayer(9), { maxTicks: 300 });
  const b = await playGame(9, randomPlayer(9), { maxTicks: 300 });
  assert.equal(a.log, b.log);
  let random = 0;
  let scripted = 0;
  for (let seed = 1; seed <= 30; seed++) {
    random += (await playGame(seed, randomPlayer(seed), { maxTicks: 300 })).score;
    scripted += (await playGame(seed, scriptedPlayer(), { maxTicks: 300 })).score;
  }
  assert.ok(scripted > random * 3, `scripted ${scripted}, random ${random}`);
});

test('R-J2 the tick cap stops a game that is still alive and says so', async () => {
  const r = await playGame(1, scriptedPlayer(), { maxTicks: 20 });
  assert.deepEqual([r.stoppedBy, r.status, r.ticks, r.cause], ['cap', 'playing', 20, null]);
});

// ---- the request to Jev ----------------------------------------------------------------------------------

test('R-J3 one decision is one POST with the key as a bearer token, the state and one choice question', async () => {
  assert.equal(JEV_URL, 'https://api.typesafe.ai/v1/systemone');
  const g = createGame(123);
  start(g);
  script.push({ choice: 'right' });
  const d = await decider()(viewOf(g));
  assert.equal(received.length, 1);
  const { auth, type, method, path, body } = received[0];
  assert.equal(method, 'POST');
  assert.equal(path, '/v1/systemone');
  assert.equal(auth, `Bearer ${KEY}`);
  assert.match(type, /^application\/json/);
  assert.deepEqual(Object.keys(body).sort(), ['model', 'questions', 'state']);
  assert.equal(body.model, 'jev-latest');
  assert.deepEqual(body.state, JSON.parse(JSON.stringify(viewOf(g))));
  assert.deepEqual(Object.keys(body.questions), ['move']);
  assert.equal(body.questions.move.type, 'choice');
  assert.ok(typeof body.questions.move.instructions === 'string' && body.questions.move.instructions.length > 20);
  assert.deepEqual(Object.keys(body.questions.move.criteria), MOVES);
  assert.deepEqual(body.questions, QUESTION);
  // What comes back to the game.
  assert.equal(d.move, 'right');
  assert.deepEqual(d.probabilities, { left: 0.1, straight: 0.8, right: 0.1 });
  assert.equal(d.confidence, 0.8);
  assert.equal(d.attempts, 1);
  assert.ok(typeof d.ms === 'number' && d.ms >= 0);
  assert.deepEqual(d.usage, { input_tokens: 100, output_tokens: 5 });
});

test('R-J3 the transport is one function and reports status, body and time without judging them', async () => {
  script.push({ status: 401 });
  const r = await askJev({ key: KEY, url: fakeUrl, state: { a: 1 }, questions: QUESTION });
  assert.deepEqual([r.status, r.body], [401, { error: 'fake' }]);
  assert.ok(r.ms >= 0);
  script.push({ raw: 'not json at all' });
  const bad = await askJev({ key: KEY, url: fakeUrl, state: {}, questions: QUESTION });
  assert.deepEqual([bad.status, bad.body], [200, null]);
});

// ---- retries, errors, budget -----------------------------------------------------------------------------

test('R-J4 429 and 529 are retried with a growing wait, at most 3 times, and every attempt counts in the budget', async () => {
  const waits = [];
  const budget = new Budget(50);
  script.push({ status: 429 }, { status: 529 }, { choice: 'left' });
  const d = await decider({ budget, sleep: async (ms) => { waits.push(ms); } })(viewOf(createGame(1)));
  assert.equal(d.move, 'left');
  assert.equal(d.attempts, 3);
  assert.equal(received.length, 3);
  assert.equal(budget.used, 3);
  assert.equal(waits.length, 2);
  assert.ok(waits[1] > waits[0] && waits[0] >= 100, `waits ${waits}`);

  // 1 call + 3 retries, all refused: the run stops with an error that names the status.
  received = [];
  script.push({ status: 529 }, { status: 529 }, { status: 529 }, { status: 529 }, { choice: 'left' });
  const budget2 = new Budget(50);
  await assert.rejects(decider({ budget: budget2 })(viewOf(createGame(1))), (e) => e instanceof JevError && e.code === 'overloaded' && e.status === 529);
  assert.equal(received.length, 4);
  assert.equal(budget2.used, 4);
});

test('R-J4 a 401, a 422 and a malformed answer stop the run at once, without a retry', async () => {
  const cases = [
    [{ status: 401 }, 'unauthorized'],
    [{ status: 422 }, 'rejected'],
    [{ status: 500 }, 'http_error'],
    [{ raw: '<html>oops</html>' }, 'malformed'],
    [{ raw: '{"answers": {}}' }, 'malformed'],
    [{ body: okBody('backwards') }, 'malformed'],
    [{ body: okBody(7) }, 'malformed'],
    [{ body: { model: 'x', answers: { move: { type: 'choice' } } } }, 'malformed'],
  ];
  for (const [answer, code] of cases) {
    received = [];
    script = [answer, { choice: 'left' }];
    await assert.rejects(decider()(viewOf(createGame(1))), (e) => e instanceof JevError && e.code === code, JSON.stringify(answer));
    assert.equal(received.length, 1, `no retry after ${code}`);
  }
});

test('R-J4 an answer slower than the time limit stops the run with a timeout, a slow one inside the limit is used', async () => {
  script.push({ choice: 'right', delayMs: 150 });
  const d = await decider({ timeoutMs: 2000 })(viewOf(createGame(1)));
  assert.equal(d.move, 'right');
  assert.ok(d.ms >= 140, `ms ${d.ms}`);
  script.push({ choice: 'right', delayMs: 800 });
  await assert.rejects(decider({ timeoutMs: 100 })(viewOf(createGame(1))), (e) => e instanceof JevError && e.code === 'timeout');
});

test('R-J5 the budget: a game stops when its calls are spent and says so', async () => {
  assert.equal(DEFAULT_MAX_CALLS, 300);
  const budget = new Budget(4);
  // The fake model turns right every time: a 2x2 circle that never dies, so only the budget can stop it.
  script = Array.from({ length: 30 }, () => ({ choice: 'right' }));
  const r = await playGame(1, makeJevDecider({ key: KEY, url: fakeUrl, sleep: noSleep, budget }), { maxTicks: 1000 });
  assert.deepEqual([r.stoppedBy, r.status, r.ticks], ['budget', 'playing', 4]);
  assert.equal(received.length, 4);
  assert.equal(budget.used, 4);
  assert.equal(budget.left, 0);
  assert.equal(r.decisions.length, 4);
  // A retry cannot overdraw the budget either.
  received = [];
  const tight = new Budget(2);
  script = [{ status: 429 }, { status: 429 }, { choice: 'left' }];
  const d = await makeJevDecider({ key: KEY, url: fakeUrl, sleep: noSleep, budget: tight })(viewOf(createGame(1)));
  assert.equal(d, null, 'the decision is given up when the budget runs out during retries');
  assert.equal(received.length, 2);
});

// ---- the command line tools -------------------------------------------------------------------------------

test('R-J6 without a key the Jev player exits with code 2 and a clear message, and calls nobody', async () => {
  const r = await run(['tools/jev-player.mjs', '--seed', '5'], { TYPESAFE_API_URL: fakeUrl });
  assert.equal(r.code, 2);
  assert.match(r.err, /TYPESAFE_API_KEY/);
  assert.equal(received.length, 0);
  const empty = await run(['tools/jev-player.mjs', '--seed', '5'], { TYPESAFE_API_KEY: '', TYPESAFE_API_URL: fakeUrl });
  assert.equal(empty.code, 2);
});

test('R-J6 the key is never printed and never written, whatever happens', async () => {
  const out = mkdtempSync(join(tmpdir(), 'dewgrub-jev-'));
  script = [{ choice: 'left' }, { status: 429 }, { choice: 'straight' }, { status: 401 }];
  const r = await run(['tools/jev-player.mjs', '--seed', '6', '--out', out], { TYPESAFE_API_KEY: KEY, TYPESAFE_API_URL: fakeUrl });
  assert.equal(r.code, 1, 'a 401 in the middle of a game is a failed run');
  const record = readFileSync(join(out, '6.json'), 'utf8');
  for (const [where, text] of [['stdout', r.out], ['stderr', r.err], ['the run record', record]]) {
    assert.ok(!text.includes(KEY), `the key appears in ${where}`);
    assert.ok(!/bearer/i.test(text), `an Authorization header appears in ${where}`);
  }
  assert.equal(received.every((q) => q.auth === `Bearer ${KEY}`), true);
  const rec = JSON.parse(record);
  assert.deepEqual([rec.stoppedBy, rec.error.code, rec.error.status], ['error', 'unauthorized', 401]);
  rmSync(out, { recursive: true, force: true });
  // No source file names a key or reads one from a file.
  for (const file of ['tools/jev-player.mjs', 'tools/jev-transport.mjs', 'tools/bench.mjs', 'tools/players.mjs']) {
    const src = readFileSync(join(root, file), 'utf8');
    assert.ok(!/readFile[^\n]*key/i.test(src), `${file} seems to read a key from a file`);
  }
});

test('R-J7 a whole game against the fake model: the run record and the replay address', async () => {
  const out = mkdtempSync(join(tmpdir(), 'dewgrub-jev-'));
  // The fake model plays like the scripted player would, from the state it is sent: it turns towards the dew.
  const towardsDew = (body) => {
    const m = body.state.moves;
    const safe = MOVES.filter((k) => m[k].hits === 'nothing' || m[k].hits === 'dew' || m[k].hits === 'spore');
    if (!safe.length) return 'straight';
    return safe.sort((a, b) => m[a].dewDistance - m[b].dewDistance)[0];
  };
  script = Array.from({ length: 60 }, () => ({ choice: towardsDew }));
  const r = await run(['tools/jev-player.mjs', '--seed', '123', '--max-calls', '40', '--out', out], { TYPESAFE_API_KEY: KEY, TYPESAFE_API_URL: fakeUrl });
  assert.equal(r.code, 0, r.err);
  const rec = JSON.parse(readFileSync(join(out, '123.json'), 'utf8'));
  assert.equal(rec.seed, 123);
  assert.equal(rec.model, 'jev-latest');
  assert.equal(rec.stoppedBy, 'budget');
  assert.equal(rec.calls, 40);
  assert.equal(rec.maxCalls, 40);
  assert.ok(rec.score >= 10, `the fake model should reach the first dew in 40 moves, score ${rec.score}`);
  assert.equal(rec.decisions.length, 40);
  assert.deepEqual(Object.keys(rec.decisions[0]).sort(), ['attempts', 'confidence', 'move', 'ms', 'probabilities', 'tick']);
  assert.deepEqual(rec.decisions.map((d) => d.tick), Array.from({ length: 40 }, (_, i) => i));
  assert.deepEqual(rec.usage, { input_tokens: 4000, output_tokens: 200 });
  assert.match(rec.log, /^[0-9a-zUDLR.]*$/);
  assert.equal(rec.replay, `dist/index.html?seed=123&replay=${rec.log}`);
  assert.ok(r.out.includes(rec.replay), 'the replay address is printed');
  assert.match(r.out, /budget/i, 'the tool says the budget was spent');
  // The log in the record is the game that was played.
  const g = createGame(123);
  start(g);
  const log = decodeLog(rec.log);
  let i = 0;
  while (g.status === 'playing' && g.tick < rec.ticks) {
    while (i < log.length && log[i].t === g.tick) turn(g, log[i++].d);
    step(g);
  }
  assert.deepEqual([stateHash(g), g.score], [rec.hash, rec.score]);
  rmSync(out, { recursive: true, force: true });
});

test('R-J7 a game the fake model loses ends with the cause, and exit code 0', async () => {
  const out = mkdtempSync(join(tmpdir(), 'dewgrub-jev-'));
  const r = await run(['tools/jev-player.mjs', '--seed', '9', '--out', out], { TYPESAFE_API_KEY: KEY, TYPESAFE_API_URL: fakeUrl });
  assert.equal(r.code, 0, r.err);
  const rec = JSON.parse(readFileSync(join(out, '9.json'), 'utf8'));
  assert.deepEqual([rec.stoppedBy, rec.status, rec.cause, rec.ticks, rec.calls], ['over', 'over', 'wall', 10, 10]);
  rmSync(out, { recursive: true, force: true });
});

test('R-J8 the benchmark runs the random and the scripted player without any key, and says Jev was not run', async () => {
  const r = await run(['tools/bench.mjs', '--seeds', '12'], { TYPESAFE_API_URL: fakeUrl });
  assert.equal(r.code, 0, r.err);
  assert.equal(received.length, 0);
  assert.match(r.out, /random/);
  assert.match(r.out, /scripted/);
  assert.match(r.out, /Jev[^\n]*not run[^\n]*TYPESAFE_API_KEY/);
  assert.ok(!/jev\s+\|\s+\d/i.test(r.out), 'no number may be shown for Jev without a run');
  const json = await run(['tools/bench.mjs', '--seeds', '12', '--json'], {});
  const data = JSON.parse(json.out);
  assert.deepEqual(data.players.map((p) => p.player), ['random', 'scripted']);
  assert.equal(data.seeds.length, 12);
  for (const p of data.players) {
    assert.equal(p.games, 12);
    assert.deepEqual(Object.keys(p).sort(), ['causes', 'games', 'meanScore', 'meanTicks', 'medianScore', 'medianTicks', 'player']);
    assert.equal(Object.values(p.causes).reduce((a, b) => a + b, 0), 12);
  }
  assert.ok(data.players[1].meanScore > data.players[0].meanScore);
  // Same seeds, same numbers: the benchmark of the two local players is repeatable.
  assert.equal((await run(['tools/bench.mjs', '--seeds', '12', '--json'], {})).out, json.out);
});

test('R-J8 the benchmark table: mean, median and how the games ended, from known games', () => {
  const games = [
    { score: 0, ticks: 10, stoppedBy: 'over', cause: 'wall' },
    { score: 10, ticks: 30, stoppedBy: 'over', cause: 'self' },
    { score: 20, ticks: 300, stoppedBy: 'cap', cause: null },
    { score: 170, ticks: 60, stoppedBy: 'over', cause: 'wall' },
  ];
  assert.deepEqual(summarise('x', games), {
    player: 'x', games: 4, meanScore: 50, medianScore: 15, meanTicks: 100, medianTicks: 45, causes: { wall: 2, self: 1, cap: 1 },
  });
  assert.equal(summarise('y', games.slice(0, 3)).medianScore, 10);
});

test('R-J8 with a key the benchmark adds Jev, on the same seeds, inside a total budget', async () => {
  const r = await run(['tools/bench.mjs', '--seeds', '4', '--max-calls', '10', '--max-total-calls', '25', '--json'],
    { TYPESAFE_API_KEY: KEY, TYPESAFE_API_URL: fakeUrl });
  assert.equal(r.code, 0, r.err);
  const data = JSON.parse(r.out);
  assert.deepEqual(data.players.map((p) => p.player), ['random', 'scripted', 'jev']);
  // The fake model always goes straight: seed after seed it hits the wall on tick 10, 10 calls each.
  // 25 calls in total: two whole games, a third cut by the budget, a fourth never started.
  assert.equal(received.length, 25);
  assert.equal(data.jevCalls, 25);
  assert.equal(data.jevBudgetSpent, true);
  const jev = data.players[2];
  // Same seeds as the other players: the first requests carry the boards of seeds 1 and 2 (their first dew).
  const firstDew = (seed) => { const g = createGame(seed); return { x: g.dew.x, y: g.dew.y }; };
  assert.deepEqual(received[0].body.state.dew, firstDew(1));
  assert.deepEqual(received[10].body.state.dew, firstDew(2));
  assert.equal(jev.games, 3);
  assert.deepEqual(jev.causes, { wall: 2, budget: 1 });
  assert.ok(!r.out.includes(KEY) && !r.err.includes(KEY));
});
