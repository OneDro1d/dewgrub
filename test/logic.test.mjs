// Unit tests for the game logic. No browser. Each test name starts with the requirement id it proves
// (docs/REQUIREMENTS.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, start, turn, step, tickMs, stateHash, snapshot, replay, encodeLog, decodeLog, parseSeed,
} from '../src/game.js';
import { chooseDir } from '../tools/bot.mjs';

const cell = (x, y) => ({ x, y });
const onGrub = (g, c) => g.grub.some((s) => s.x === c.x && s.y === c.y);

// A started game with the dew parked in a corner, so a test can move without eating by accident.
function bare(seed = 1) {
  const g = createGame(seed);
  g.dew = cell(0, 0);
  start(g);
  return g;
}

// The scripted player plays one whole game. If it is still alive at maxTicks it stops steering,
// so the grub runs straight into a wall and the game always ends.
function botGame(seed, maxTicks = 4000) {
  const g = createGame(seed);
  start(g);
  const hashes = [];
  while (g.status === 'playing') {
    if (g.tick < maxTicks) {
      const d = chooseDir(snapshot(g));
      if (d !== g.dir) turn(g, d);
    }
    step(g);
    hashes.push(stateHash(g));
  }
  return { g, hashes };
}

function checkInvariants(g, label) {
  const seen = new Set();
  for (const s of g.grub) {
    assert.ok(s.x >= 0 && s.x < g.cols && s.y >= 0 && s.y < g.rows, `${label}: grub cell outside grid`);
    const k = `${s.x},${s.y}`;
    assert.ok(!seen.has(k), `${label}: grub overlaps itself at ${k}`);
    seen.add(k);
  }
  if (g.dew) assert.ok(!onGrub(g, g.dew), `${label}: dew on grub`);
  if (g.spore) {
    assert.ok(!onGrub(g, g.spore), `${label}: spore on grub`);
    assert.ok(!(g.dew && g.dew.x === g.spore.x && g.dew.y === g.spore.y), `${label}: spore on dew`);
  }
  assert.equal(g.score, 10 * g.dewEaten + 50 * g.sporesEaten, `${label}: score`);
  assert.equal(g.grub.length, 3 + g.dewEaten, `${label}: length`);
}

test('R-L1 same seed and same turns give the same hash after every tick', () => {
  const a = botGame(42);
  const b = botGame(42);
  assert.ok(a.hashes.length > 20, 'the game should last more than 20 ticks');
  assert.deepEqual(a.hashes, b.hashes);
});

test('R-L1 different seeds put the first dew in different places', () => {
  const pos = [];
  for (let s = 1; s <= 50; s++) {
    const g = createGame(s);
    pos.push(`${g.dew.x},${g.dew.y}`);
  }
  for (let i = 0; i + 5 <= pos.length; i++) {
    assert.ok(new Set(pos.slice(i, i + 5)).size > 1, `seeds ${i + 1}..${i + 5} all gave ${pos[i]}`);
  }
});

test('R-L2 a new game has the documented starting state', () => {
  const g = createGame(123);
  assert.equal(g.cols, 20);
  assert.equal(g.rows, 20);
  assert.deepEqual(g.grub, [cell(10, 10), cell(9, 10), cell(8, 10)]);
  assert.equal(g.dir, 'R');
  assert.equal(g.status, 'ready');
  assert.equal(g.score, 0);
  assert.equal(g.tick, 0);
  assert.equal(g.spore, null);
  assert.ok(g.dew.x >= 0 && g.dew.x < 20 && g.dew.y >= 0 && g.dew.y < 20);
  assert.ok(!onGrub(g, g.dew));
});

test('R-L3 nothing moves while the game is ready', () => {
  const g = createGame(1);
  const before = stateHash(g);
  assert.deepEqual(step(g), []);
  assert.equal(stateHash(g), before);
  assert.equal(g.tick, 0);
});

test('R-L3 one step moves the head one cell and keeps the length', () => {
  const g = bare();
  step(g);
  assert.deepEqual(g.grub, [cell(11, 10), cell(10, 10), cell(9, 10)]);
  assert.equal(g.tick, 1);
});

test('R-L4 a turn takes effect on the next step', () => {
  const g = bare();
  assert.equal(turn(g, 'U'), true);
  assert.deepEqual(g.grub[0], cell(10, 10));
  step(g);
  assert.deepEqual(g.grub[0], cell(10, 9));
  assert.equal(g.dir, 'U');
});

test('R-L4 a reversal or a repeat of the current direction is rejected', () => {
  const g = bare();
  assert.equal(turn(g, 'L'), false);
  assert.equal(turn(g, 'R'), false);
  assert.equal(turn(g, 'X'), false);
  step(g);
  assert.deepEqual(g.grub[0], cell(11, 10));
});

test('R-L4 two turns can wait, a third is rejected, each is checked against the one before', () => {
  const g = bare();
  assert.equal(turn(g, 'U'), true);
  assert.equal(turn(g, 'D'), false, 'D reverses the queued U');
  assert.equal(turn(g, 'L'), true, 'L is legal after the queued U');
  assert.equal(turn(g, 'D'), false, 'queue is full');
  step(g);
  assert.deepEqual(g.grub[0], cell(10, 9));
  step(g);
  assert.deepEqual(g.grub[0], cell(9, 9));
});

test('R-L5 leaving the grid on any side ends the game with cause wall', () => {
  for (const [dir, steps] of [['R', 9], ['U', 10], ['D', 9]]) {
    const g = bare();
    if (dir !== 'R') turn(g, dir);
    for (let i = 0; i < steps; i++) step(g);
    assert.equal(g.status, 'playing', `${dir}: still alive on the edge`);
    const events = step(g);
    assert.equal(g.status, 'over', dir);
    assert.equal(g.cause, 'wall', dir);
    assert.ok(events.includes('over'));
  }
  const g = bare();
  turn(g, 'U');
  step(g);
  turn(g, 'L');
  for (let i = 0; i < 10; i++) step(g);
  assert.equal(g.status, 'playing');
  step(g);
  assert.equal(g.cause, 'wall');
});

test('R-L6 running into the body ends the game with cause self', () => {
  const g = bare();
  g.grub = [cell(5, 5), cell(6, 5), cell(6, 6), cell(5, 6), cell(4, 6)];
  g.dewEaten = 2;
  g.score = 20;
  g.dir = 'L';
  turn(g, 'D');
  const events = step(g);
  assert.equal(g.status, 'over');
  assert.equal(g.cause, 'self');
  assert.ok(events.includes('over'));
});

test('R-L6 moving onto the cell the tail leaves is legal', () => {
  const g = bare();
  g.grub = [cell(5, 5), cell(6, 5), cell(6, 6), cell(5, 6)];
  g.dewEaten = 1;
  g.score = 10;
  g.dir = 'L';
  turn(g, 'D');
  step(g);
  assert.equal(g.status, 'playing');
  assert.deepEqual(g.grub, [cell(5, 6), cell(5, 5), cell(6, 5), cell(6, 6)]);
});

test('R-L7 eating dew scores 10, grows by one and places new dew on a free cell', () => {
  const g = bare();
  g.dew = cell(11, 10);
  const events = step(g);
  assert.equal(g.score, 10);
  assert.equal(g.dewEaten, 1);
  assert.deepEqual(g.grub, [cell(11, 10), cell(10, 10), cell(9, 10), cell(8, 10)]);
  assert.ok(!onGrub(g, g.dew));
  assert.ok(events.includes('eat'));
});

test('R-L8 a spore appears after the 5th dew, lasts 40 ticks, then is gone', () => {
  const g = bare();
  g.grub = [cell(10, 10), cell(9, 10), cell(8, 10), cell(7, 10), cell(6, 10), cell(5, 10), cell(4, 10)];
  g.dewEaten = 4;
  g.score = 40;
  g.dew = cell(11, 10);
  const events = step(g);
  assert.ok(events.includes('spore-appear'));
  assert.equal(g.spore.ttl, 40);
  assert.ok(!onGrub(g, g.spore));
  assert.ok(!(g.spore.x === g.dew.x && g.spore.y === g.dew.y));

  // Park dew and spore out of the way, shorten the grub to 4 and run in a 2×2 circle for 40 ticks.
  g.grub = g.grub.slice(0, 4);
  g.dewEaten = 1;
  g.score = 10;
  g.dew = cell(0, 0);
  g.spore = { x: 0, y: 19, ttl: 40 };
  const circle = ['U', 'L', 'D', 'R'];
  for (let i = 0; i < 39; i++) {
    turn(g, circle[i % 4]);
    assert.ok(!step(g).includes('spore-gone'), `gone too early at ${i}`);
  }
  assert.equal(g.spore.ttl, 1);
  turn(g, circle[39 % 4]);
  assert.ok(step(g).includes('spore-gone'));
  assert.equal(g.spore, null);
  assert.equal(g.status, 'playing');
});

test('R-L8 eating a spore scores 50 and does not grow', () => {
  const g = bare();
  g.spore = { x: 11, y: 10, ttl: 7 };
  const events = step(g);
  assert.ok(events.includes('spore'));
  assert.equal(g.score, 50);
  assert.equal(g.sporesEaten, 1);
  assert.equal(g.grub.length, 3);
  assert.equal(g.spore, null);
});

test('R-L8 a spore on its last tick can still be eaten', () => {
  const g = bare();
  g.spore = { x: 11, y: 10, ttl: 1 };
  assert.ok(step(g).includes('spore'));
  assert.equal(g.score, 50);
});

test('R-L8 no second spore appears while one exists', () => {
  const g = bare();
  g.grub = [cell(10, 10), cell(9, 10), cell(8, 10)];
  g.dewEaten = 4;
  g.score = 40;
  g.grub.push(cell(7, 10), cell(6, 10), cell(5, 10), cell(4, 10));
  g.dew = cell(11, 10);
  g.spore = { x: 0, y: 19, ttl: 30 };
  const events = step(g);
  assert.ok(!events.includes('spore-appear'));
  assert.deepEqual(g.spore, { x: 0, y: 19, ttl: 29 });
});

test('R-L9 tick length starts at 150 ms, drops 8 ms per 3 dew, floor 70 ms', () => {
  const g = createGame(1);
  const at = (n) => { g.dewEaten = n; return tickMs(g); };
  assert.equal(at(0), 150);
  assert.equal(at(2), 150);
  assert.equal(at(3), 142);
  assert.equal(at(29), 78);
  assert.equal(at(30), 70);
  assert.equal(at(300), 70);
});

test('R-L10 after game over, step and turn change nothing', () => {
  const g = bare();
  for (let i = 0; i < 10; i++) step(g);
  assert.equal(g.status, 'over');
  const before = stateHash(g);
  assert.deepEqual(step(g), []);
  assert.equal(turn(g, 'U'), false);
  assert.equal(stateHash(g), before);
});

test('R-L11 filling the grid ends the game with cause full', () => {
  const g = bare();
  g.cols = 2;
  g.rows = 2;
  g.grub = [cell(0, 0), cell(0, 1), cell(1, 1)];
  g.dir = 'U';
  g.dew = cell(1, 0);
  turn(g, 'R');
  const events = step(g);
  assert.equal(g.status, 'over');
  assert.equal(g.cause, 'full');
  assert.equal(g.score, 10);
  assert.equal(g.grub.length, 4);
  assert.ok(events.includes('eat') && events.includes('over'));
});

test('R-L12 accepted turns are logged with their tick, rejected ones are not', () => {
  const g = bare();
  turn(g, 'L');
  turn(g, 'U');
  step(g);
  step(g);
  turn(g, 'U');
  turn(g, 'L');
  assert.deepEqual(g.log, [{ t: 0, d: 'U' }, { t: 2, d: 'L' }]);
});

test('R-L12 replay of seed and turn log reproduces the final state', () => {
  for (const seed of [7, 8, 9]) {
    const { g } = botGame(seed);
    assert.equal(g.status, 'over');
    assert.ok(g.log.length > 5, 'the scripted player should have turned');
    const r = replay(seed, g.log);
    assert.equal(stateHash(r), stateHash(g), `seed ${seed}`);
    assert.equal(r.score, g.score);
  }
});

test('R-L12 the turn log encodes to a URL-safe string and back', () => {
  const { g } = botGame(11);
  const s = encodeLog(g.log);
  assert.match(s, /^[0-9a-zUDLR.]*$/);
  assert.equal(encodeURIComponent(s), s);
  assert.deepEqual(decodeLog(s), g.log);
  assert.deepEqual(decodeLog(''), []);
  assert.equal(encodeLog([]), '');
  assert.equal(encodeLog([{ t: 0, d: 'U' }, { t: 36, d: 'L' }]), '0U.10L');
});

test('R-L12 a malformed turn log is rejected', () => {
  for (const bad of ['zz', '5', 'R', '5R.3U', '5R..6U', '5X', '-1R', '5r', ' 5R']) {
    assert.throws(() => decodeLog(bad), undefined, bad);
  }
});

test('R-L13 seed parsing', () => {
  assert.equal(parseSeed('123'), 123);
  assert.equal(parseSeed('0'), 0);
  assert.equal(parseSeed('4294967296'), 0);
  assert.equal(parseSeed('4294967299'), 3);
  assert.equal(parseSeed(''), null);
  assert.equal(parseSeed(null), null);
  assert.equal(parseSeed(undefined), null);
  const a = parseSeed('hello');
  assert.ok(Number.isInteger(a) && a >= 0 && a < 2 ** 32);
  assert.equal(parseSeed('hello'), a);
  assert.notEqual(parseSeed('hellp'), a);
  assert.ok(Number.isInteger(parseSeed('-5')));
});

test('R-L14 invariants hold on every tick of 100 games by the scripted player', () => {
  let totalTicks = 0;
  let best = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const g = createGame(seed);
    start(g);
    while (g.status === 'playing') {
      if (g.tick < 4000) {
        const d = chooseDir(snapshot(g));
        if (d !== g.dir) turn(g, d);
      }
      step(g);
      checkInvariants(g, `bot seed ${seed} tick ${g.tick}`);
    }
    totalTicks += g.tick;
    best = Math.max(best, g.score);
  }
  assert.ok(totalTicks > 10000, `expected long games, got ${totalTicks} ticks in total`);
  assert.ok(best >= 200, `the scripted player should reach 200 at least once, best was ${best}`);
});

test('R-L14 invariants hold on every tick of 100 games with random input', () => {
  const dirs = ['U', 'D', 'L', 'R'];
  let ended = 0;
  let ticks = 0;
  for (let seed = 1; seed <= 100; seed++) {
    // The test's own generator (not the game's). High bits only: the low bits of this kind repeat fast.
    let r = seed * 2654435761 >>> 0;
    const rnd = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r >>> 20; };
    const g = createGame(seed);
    start(g);
    while (g.status === 'playing' && g.tick < 2000) {
      const n = rnd() % 4;
      for (let i = 0; i < n; i++) turn(g, dirs[rnd() % 4]);
      step(g);
      checkInvariants(g, `random seed ${seed} tick ${g.tick}`);
    }
    if (g.status === 'over') ended++;
    ticks += g.tick;
  }
  assert.ok(ended >= 90, `random input should usually die, ${ended}/100 games ended`);
  assert.ok(ticks > 500, `random games should last a while, ${ticks} ticks in total`);
});

test('R-L15 step reports what happened and snapshot is a copy', () => {
  const g = bare();
  assert.deepEqual(step(g), []);
  g.dew = cell(12, 10);
  assert.deepEqual(step(g), ['eat']);
  const snap = snapshot(g);
  assert.equal(snap.hash, stateHash(g));
  assert.equal(snap.tickMs, tickMs(g));
  snap.grub[0].x = 99;
  snap.score = 999;
  assert.equal(g.grub[0].x, 12);
  assert.equal(g.score, 10);
});
