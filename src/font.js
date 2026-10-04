// The pixel font, made here. Each glyph is 3 cells wide and 5 high, written row by row, 1 = lit.

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
  M: '101111111101101',
  N: '110101101101101',
  O: '010101101101010',
  P: '110101110100100',
  Q: '010101101110011',
  R: '110101110101101',
  S: '011100010001110',
  T: '111010010010010',
  U: '101101101101111',
  V: '101101101101010',
  W: '101101101111101',
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
  steer: 'SWIPE OR ARROWS TO STEER',
  over: 'GAME OVER',
  wall: 'HIT THE WALL',
  self: 'BIT YOURSELF',
  full: 'GRID FULL - YOU WIN!',
  paused: 'PAUSED',
  replay: 'REPLAY',
  muted: 'SOUND OFF',
};

// Width in pixels of a text at a given scale: 3 cells per glyph plus 1 cell between glyphs.
export function textWidth(text, scale) {
  return text.length === 0 ? 0 : (text.length * 4 - 1) * scale;
}

// The lit cells of a text, in cell units from its top-left corner.
export function textCells(text) {
  const cells = [];
  for (let n = 0; n < text.length; n++) {
    const glyph = GLYPHS[text[n]];
    if (!glyph) continue;
    for (let i = 0; i < 15; i++) {
      if (glyph[i] === '1') cells.push({ x: n * 4 + (i % 3), y: Math.floor(i / 3) });
    }
  }
  return cells;
}
