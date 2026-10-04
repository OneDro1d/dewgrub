// The pixel font, made here. Each glyph is 5 cells high, written row by row, 1 = lit.
// Most glyphs are 3 cells wide; M and W are 5 wide, because at 3 wide they read as H.

export const GLYPH_ROWS = 5;

export const GLYPHS = {
  A: '010101111101101',
  B: '110101110101110',
  C: '011100100100011',
  D: '110101101101110',
  E: '111100110100111',
  F: '111100110100100',
  G: '011100101101011',
  H: '101101111101101',
  I: '111010010010111',
  J: '001001001101010',
  K: '101101110101101',
  L: '100100100100111',
  M: '1000111011101011000110001',
  N: '110101101101101',
  O: '010101101101010',
  P: '110101110100100',
  Q: '010101101110011',
  R: '110101110101101',
  S: '011100010001110',
  T: '111010010010010',
  U: '101101101101111',
  V: '101101101101010',
  W: '1000110001101011010101010',
  X: '101101010101101',
  Y: '101101010010010',
  Z: '111001010100111',
  0: '111101101101111',
  1: '010110010010111',
  2: '110001010100111',
  3: '110001010001110',
  4: '101101111001001',
  5: '111100110001110',
  6: '011100111101111',
  7: '111001010010010',
  8: '111101111101111',
  9: '111101111001110',
  ' ': '000000000000000',
  '-': '000000111000000',
  '.': '000000000000010',
  '!': '010010010000010',
  ':': '000010000010000',
};

// Every fixed text the game draws. Numbers are added at run time and use the digit glyphs.
export const TEXTS = {
  title: 'DEWGRUB',
  score: 'SCORE',
  best: 'BEST',
  seed: 'SEED',
  go: 'TAP OR PRESS SPACE',
  start: 'SWIPE OR PRESS AN ARROW',
  toStart: 'TO START',
  hint: 'STEER TO START',
  over: 'GAME OVER',
  wall: 'HIT THE WALL',
  self: 'BIT YOURSELF',
  full: 'GRID FULL - YOU WIN!',
  paused: 'PAUSED',
  replay: 'REPLAY',
  muted: 'SOUND OFF',
};

export function glyphWidth(ch) {
  const glyph = GLYPHS[ch];
  return glyph ? glyph.length / GLYPH_ROWS : 3;
}

// The lit cells of a text, in cell units from its top-left corner. One empty column between glyphs.
// A character with no glyph leaves a 3-cell gap.
export function textCells(text) {
  const cells = [];
  let left = 0;
  for (const ch of text) {
    const glyph = GLYPHS[ch];
    const w = glyphWidth(ch);
    if (glyph) {
      for (let i = 0; i < glyph.length; i++) {
        if (glyph[i] === '1') cells.push({ x: left + (i % w), y: Math.floor(i / w) });
      }
    }
    left += w + 1;
  }
  return cells;
}

// Width in pixels of a text at a given scale.
export function textWidth(text, scale) {
  let cells = 0;
  for (const ch of text) cells += glyphWidth(ch) + 1;
  return cells === 0 ? 0 : (cells - 1) * scale;
}
