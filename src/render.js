// Draws one frame on a 2D canvas. All art is drawn here, in code. Reads the game state, never changes it.
import { GLYPHS, TEXTS, textWidth } from './font.js';

export const CELL = 16;
export const HUD_H = 48;
export const VIEW_W = 320;
export const VIEW_H = 368;

const FACING = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
const INK = '#e8f6d8';
const DIM = '#8fb08a';
const GOLD = '#ffd65a';

// A fixed pseudo-random number per cell, for the moss specks. It does not touch the game's generator.
function cellNoise(x, y) {
  let h = Math.imul(x * 374761393 + y * 668265263 + 12345, 1274126177);
  h ^= h >>> 15;
  return h >>> 0;
}

function drawText(ctx, drawn, text, x, y, scale, colour, align) {
  const w = textWidth(text, scale);
  let px = align === 'center' ? Math.round(x - w / 2) : align === 'right' ? x - w : x;
  ctx.fillStyle = colour;
  for (const ch of text) {
    const glyph = GLYPHS[ch];
    if (glyph) {
      for (let i = 0; i < 15; i++) {
        if (glyph[i] === '1') ctx.fillRect(px + (i % 3) * scale, y + Math.floor(i / 3) * scale, scale, scale);
      }
    }
    px += 4 * scale;
  }
  drawn.push(text);
}

function disc(ctx, x, y, r, colour) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawSoil(ctx, g) {
  for (let y = 0; y < g.rows; y++) {
    for (let x = 0; x < g.cols; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#16261d' : '#132119';
      ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      const n = cellNoise(x, y);
      if (n % 3 === 0) {
        ctx.fillStyle = n % 2 ? '#24482f' : '#1d3a27';
        ctx.fillRect(x * CELL + (n >>> 4) % 13, y * CELL + (n >>> 8) % 13, 2, 2);
        ctx.fillRect(x * CELL + (n >>> 12) % 14, y * CELL + (n >>> 16) % 14, 1, 1);
      }
    }
  }
}

function drawDew(ctx, dew, now) {
  const cx = dew.x * CELL + CELL / 2;
  const cy = dew.y * CELL + CELL / 2;
  const r = 5 + 0.7 * Math.sin(now / 280);
  const shade = ctx.createRadialGradient(cx - 1.5, cy - 1.5, 0.5, cx, cy, r);
  shade.addColorStop(0, '#e9fbff');
  shade.addColorStop(0.45, '#7fd6ff');
  shade.addColorStop(1, '#2f7fc4');
  disc(ctx, cx, cy, r, shade);
  disc(ctx, cx - 1.8, cy - 1.9, 1.2, '#ffffff');
}

function drawSpore(ctx, spore, now, fullTtl) {
  const cx = spore.x * CELL + CELL / 2;
  const cy = spore.y * CELL + CELL / 2;
  const spin = now / 500;
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const r = i % 2 ? 3 : 6.5;
    const a = spin + (i * Math.PI) / 8;
    ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  ctx.closePath();
  ctx.fill();
  disc(ctx, cx, cy, 1.8, '#fff6c8');
  // The ring shows how long the spore will stay.
  ctx.strokeStyle = '#fff3b0';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, 7.6, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * spore.ttl) / fullTtl);
  ctx.stroke();
}

function drawGrub(ctx, g) {
  const dead = g.status === 'over' && g.cause !== 'full';
  const mid = (c) => [c.x * CELL + CELL / 2, c.y * CELL + CELL / 2];
  for (let i = g.grub.length - 1; i >= 0; i--) {
    const [x, y] = mid(g.grub[i]);
    const colour = dead ? (i % 2 ? '#8a6a55' : '#a17a60') : (i % 2 ? '#6fc24a' : '#9be564');
    if (i < g.grub.length - 1) {
      const [nx, ny] = mid(g.grub[i + 1]);
      disc(ctx, (x + nx) / 2, (y + ny) / 2, 5.6, colour);
    }
    disc(ctx, x, y, i === 0 ? 7.4 : 6.4, i === 0 ? (dead ? '#b98a6a' : '#c5f58a') : colour);
    if (i > 0 && i % 2 === 0) disc(ctx, x, y, 1.6, dead ? '#6b5142' : '#4f9a37');
  }
  const [hx, hy] = mid(g.grub[0]);
  const [fx, fy] = FACING[g.dir];
  for (const side of [-1, 1]) {
    const ex = hx + fx * 2.6 + -fy * 3.2 * side;
    const ey = hy + fy * 2.6 + fx * 3.2 * side;
    if (dead) {
      ctx.strokeStyle = '#2a1a14';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ex - 1.6, ey - 1.6);
      ctx.lineTo(ex + 1.6, ey + 1.6);
      ctx.moveTo(ex + 1.6, ey - 1.6);
      ctx.lineTo(ex - 1.6, ey + 1.6);
      ctx.stroke();
    } else {
      disc(ctx, ex, ey, 2.3, '#ffffff');
      disc(ctx, ex + fx * 0.9, ey + fy * 0.9, 1.1, '#10200f');
    }
  }
}

function panel(ctx, y, h) {
  ctx.fillStyle = 'rgba(8, 14, 11, 0.8)';
  ctx.fillRect(16, y, VIEW_W - 32, h);
  ctx.strokeStyle = '#5fae57';
  ctx.lineWidth = 2;
  ctx.strokeRect(17, y + 1, VIEW_W - 34, h - 2);
}

// view: { g, best, paused, muted, replaying, now, sporeTicks }. Returns the list of texts it drew.
export function drawFrame(ctx, view) {
  const g = view.g;
  const drawn = [];
  const mid = VIEW_W / 2;

  ctx.fillStyle = '#0c1511';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawText(ctx, drawn, TEXTS.title, 6, 6, 3, '#9be564');
  drawText(ctx, drawn, `${TEXTS.seed} ${g.seed}`, 6, 32, 2, DIM);
  drawText(ctx, drawn, `${TEXTS.score} ${g.score}`, VIEW_W - 6, 6, 2, INK, 'right');
  drawText(ctx, drawn, `${TEXTS.best} ${view.best}`, VIEW_W - 6, 19, 2, DIM, 'right');
  if (view.replaying) drawText(ctx, drawn, TEXTS.replay, VIEW_W - 6, 32, 2, GOLD, 'right');
  else if (view.muted) drawText(ctx, drawn, TEXTS.muted, VIEW_W - 6, 32, 2, DIM, 'right');

  ctx.save();
  ctx.translate(0, HUD_H);
  drawSoil(ctx, g);
  if (g.dew) drawDew(ctx, g.dew, view.now);
  if (g.spore) drawSpore(ctx, g.spore, view.now, view.sporeTicks);
  drawGrub(ctx, g);
  ctx.strokeStyle = '#5fae57';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, g.cols * CELL - 2, g.rows * CELL - 2);

  if (g.status === 'ready') {
    // Above the middle row, so the grub and its first move stay visible.
    panel(ctx, 24, 116);
    drawText(ctx, drawn, TEXTS.title, mid, 40, 6, '#9be564', 'center');
    drawText(ctx, drawn, TEXTS.go, mid, 90, 2, INK, 'center');
    drawText(ctx, drawn, TEXTS.steer, mid, 112, 2, DIM, 'center');
  } else if (g.status === 'over') {
    panel(ctx, 76, 150);
    drawText(ctx, drawn, TEXTS.over, mid, 92, 5, g.cause === 'full' ? GOLD : '#ff8a6a', 'center');
    drawText(ctx, drawn, TEXTS[g.cause] || '', mid, 130, 2, DIM, 'center');
    drawText(ctx, drawn, `${TEXTS.score} ${g.score}`, mid, 152, 3, INK, 'center');
    drawText(ctx, drawn, TEXTS.go, mid, 190, 2, INK, 'center');
  } else if (view.paused) {
    panel(ctx, 124, 60);
    drawText(ctx, drawn, TEXTS.paused, mid, 142, 5, INK, 'center');
  }
  ctx.restore();
  return drawn;
}
