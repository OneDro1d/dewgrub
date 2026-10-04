import { createGame, start, turn, step, stateHash, replay, encodeLog, decodeLog, parseSeed } from '/home/coder/code/onedro1d/showcase-s2/src/game.js';

// 1. live-vs-replay fuzz: random turns (accepted or not), random pauses (no steps), like main.js would do
let bad = 0, n = 0, longest = 0;
const dirs = ['U', 'D', 'L', 'R'];
for (let seed = 0; seed < 3000; seed++) {
  let r = (seed * 2654435761 + 7) >>> 0;
  const rnd = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r >>> 16; };
  const g = createGame(seed * 1234567);
  start(g);
  while (g.status === 'playing' && g.tick < 3000) {
    const k = rnd() % 3;
    for (let i = 0; i < k; i++) turn(g, dirs[rnd() % 4]);
    step(g);
  }
  // let it run straight until the end like the page does
  while (g.status === 'playing') step(g);
  const text = encodeLog(g.log);
  const rg = replay(seed * 1234567, decodeLog(text));
  n++; longest = Math.max(longest, g.tick);
  if (stateHash(rg) !== stateHash(g)) { bad++; if (bad < 4) console.log('MISMATCH seed', seed * 1234567, g.tick, rg.tick, g.cause, rg.cause); }
}
console.log('fuzz games', n, 'mismatches', bad, 'longest', longest);

// 2. hostile decode
for (const s of ['0U', '0U.0U.0U.0U.0U', 'zzzzzzzzzzzzzzzzU', '1U.1D', '9007199254740991U', '0U.', '.', '00U', 'Z0U', '0u']) {
  try { const l = decodeLog(s); const g = replay(5, l); console.log(JSON.stringify(s), 'ok len', l.length, 'end tick', g.tick, g.cause); }
  catch (e) { console.log(JSON.stringify(s), 'throws', e.message); }
}
// 3. seeds
for (const s of ['00', '007', '1e3', ' 1', '4294967295', '4294967296', '-1', '١٢٣']) console.log('parseSeed', JSON.stringify(s), parseSeed(s));
let t = Date.now(); parseSeed('9'.repeat(1000000)); console.log('1e6-digit seed ms', Date.now() - t);
t = Date.now(); const big = Array.from({ length: 200000 }, (_, i) => i.toString(36) + 'U').join('.'); console.log('big log len', big.length);
try { const l = decodeLog(big); console.log('decoded', l.length); const g = replay(1, l); console.log('replay ticks', g.tick, 'ms', Date.now() - t); } catch (e) { console.log('throw', e.message); }
