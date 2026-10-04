// Unit tests for the parts of the presentation that need no browser: font, sound recipes, input mapping.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLYPHS, TEXTS, textWidth, textCells } from '../src/font.js';
import { SOUNDS, soundLength } from '../src/sounds.js';
import { keyIntent, swipeDir, SWIPE_MIN } from '../src/input.js';

test('R-P1 every glyph is 5 high, 3 wide (M and W: 5 wide), and no two glyphs are the same', () => {
  const seen = new Map();
  for (const [ch, bits] of Object.entries(GLYPHS)) {
    assert.match(bits, ch === 'M' || ch === 'W' ? /^[01]{25}$/ : /^[01]{15}$/, `glyph "${ch}"`);
    assert.ok(!seen.has(bits), `glyph "${ch}" is identical to "${seen.get(bits)}"`);
    seen.set(bits, ch);
  }
  assert.ok(seen.size >= 36 + 1, 'letters, digits and the space at least');
});

test('R-P1 every character of every game text, and every digit, has a glyph', () => {
  for (const [key, text] of Object.entries(TEXTS)) {
    for (const ch of text) assert.ok(GLYPHS[ch], `text "${key}" uses "${ch}", which has no glyph`);
  }
  for (const ch of '0123456789') assert.ok(GLYPHS[ch]);
});

test('R-P1 text layout: width and lit cells', () => {
  assert.equal(textWidth('', 2), 0);
  assert.equal(textWidth('A', 1), 3);
  assert.equal(textWidth('AB', 2), 14);
  assert.deepEqual(textCells('.'), [{ x: 1, y: 4 }]);
  assert.deepEqual(textCells(' .'), [{ x: 5, y: 4 }]);
  assert.equal(textCells('8').length, 13);
  // W is 5 wide: "WI" is 5 + 1 + 3 cells, and the I starts in column 6.
  assert.equal(textWidth('WI', 1), 9);
  assert.equal(textWidth('W', 3), 15);
  assert.equal(Math.min(...textCells('WI').filter((c) => c.x > 4).map((c) => c.x)), 6);
  assert.equal(Math.max(...textCells('W').map((c) => c.x)), 4);
  // A character with no glyph draws nothing and leaves a 3-cell gap.
  assert.deepEqual(textCells('~'), []);
  assert.equal(textWidth('~.', 1), 7);
});

test('R-P2 every game event has a sound recipe inside the limits', () => {
  for (const name of ['start', 'turn', 'eat', 'spore', 'spore-appear', 'spore-gone', 'over']) {
    const notes = SOUNDS[name];
    assert.ok(Array.isArray(notes) && notes.length > 0, `no recipe for "${name}"`);
    for (const n of notes) {
      assert.ok(n.f >= 80 && n.f <= 4000, `${name}: frequency ${n.f}`);
      assert.ok(n.gain > 0 && n.gain <= 0.3, `${name}: gain ${n.gain}`);
      assert.ok(n.at >= 0 && n.dur > 0, `${name}: timing`);
      assert.ok(['sine', 'square', 'triangle', 'sawtooth'].includes(n.type), `${name}: type ${n.type}`);
    }
    assert.ok(soundLength(notes) <= 1, `${name}: longer than 1 s`);
  }
});

test('R-P3 key mapping', () => {
  const dirs = { ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R', w: 'U', a: 'L', s: 'D', d: 'R', W: 'U', A: 'L', S: 'D', D: 'R' };
  for (const [key, dir] of Object.entries(dirs)) assert.deepEqual(keyIntent(key), { type: 'turn', dir }, key);
  assert.deepEqual(keyIntent(' '), { type: 'go' });
  assert.deepEqual(keyIntent('Enter'), { type: 'go' });
  assert.deepEqual(keyIntent('p'), { type: 'pause' });
  assert.deepEqual(keyIntent('P'), { type: 'pause' });
  assert.deepEqual(keyIntent('m'), { type: 'mute' });
  assert.deepEqual(keyIntent('M'), { type: 'mute' });
  for (const key of ['x', 'Escape', 'Tab', 'toString', 'constructor', '']) assert.equal(keyIntent(key), null, key);
});

test('R-P3 swipe mapping', () => {
  assert.equal(SWIPE_MIN, 24);
  assert.equal(swipeDir(0, 0), null);
  assert.equal(swipeDir(23, 23), null);
  assert.equal(swipeDir(-23, 5), null);
  assert.equal(swipeDir(24, 0), 'R');
  assert.equal(swipeDir(-24, 0), 'L');
  assert.equal(swipeDir(0, 24), 'D');
  assert.equal(swipeDir(0, -24), 'U');
  assert.equal(swipeDir(30, -29), 'R');
  assert.equal(swipeDir(-29, 30), 'D');
  assert.equal(swipeDir(-40, -10), 'L');
  assert.equal(swipeDir(10, -40), 'U');
});
