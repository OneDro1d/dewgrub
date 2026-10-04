// The page: wires the clock, the keyboard, the touch screen, the sounds and the canvas to the game logic.
import {
  SPORE_TICKS, createGame, start, turn, step, tickMs, snapshot, parseSeed, encodeLog, decodeLog,
} from './game.js';
import { keyIntent, swipeDir } from './input.js';
import { createAudio } from './audio.js';
import { VIEW_W, VIEW_H, drawFrame } from './render.js';

const VERSION = 'v4';
const RESTART_GUARD_MS = 350; // a key or tap this soon after dying is ignored, so a late move cannot restart

const params = new URLSearchParams(window.location.search);
const urlSeed = parseSeed(params.get('seed'));
const manualClock = params.get('clock') === 'manual';
let replayLog = null;
if (urlSeed !== null && params.has('replay')) {
  try { replayLog = decodeLog(params.get('replay')); } catch (e) { replayLog = null; }
}

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const muteEl = document.getElementById('mute');
const replayEl = document.getElementById('replay');
const audio = createAudio(window);

let game = null;
let best = 0;
let paused = false;
let replaying = false;
let replayAt = 0;
let overAt = 0;
let lastFrame = null;
let carry = 0;
let lastDrawn = [];
let pixelScale = 1;

function freshSeed() {
  if (urlSeed !== null) return urlSeed;
  if (window.crypto && window.crypto.getRandomValues) return window.crypto.getRandomValues(new Uint32Array(1))[0];
  return Date.now() >>> 0;
}

function newGame() {
  game = createGame(freshSeed());
  paused = false;
  carry = 0;
  replayEl.hidden = true;
  if (replayLog) {
    // A replay runs once, on its own, straight after the page loads.
    replaying = true;
    replayAt = 0;
    start(game);
  } else {
    replaying = false;
  }
  showScore();
  describe();
}

function showScore() {
  scoreEl.textContent = `Score ${game.score}`;
}

const CAUSES = { wall: 'hit the wall', self: 'bit yourself', full: 'the grid is full, you win' };

// The canvas is a picture to a screen reader, so its label says what the picture shows.
function describe() {
  let text = 'Playing.';
  if (replaying) text = 'Replay of a recorded run.';
  else if (game.status === 'ready') text = 'Press Space or tap to start. Steer with the arrow keys or by swiping.';
  else if (game.status === 'over') text = `Game over: ${CAUSES[game.cause]}. Score ${game.score}. Press Space or tap to play again.`;
  else if (paused) text = `Paused. Score ${game.score}. Press P or Space to go on.`;
  const label = `Dewgrub game board. ${text}`;
  if (canvas.getAttribute('aria-label') !== label) canvas.setAttribute('aria-label', label);
}

function tick() {
  if (replaying) {
    while (replayAt < replayLog.length && replayLog[replayAt].t === game.tick) turn(game, replayLog[replayAt++].d);
  }
  const events = step(game);
  for (const e of events) audio.play(e);
  if (game.status === 'over') {
    overAt = performance.now();
    best = Math.max(best, game.score);
    replayEl.href = `?seed=${game.seed}&replay=${encodeLog(game.log)}`;
    replayEl.hidden = false;
    if (replaying) {
      replaying = false;
      replayLog = null;
    }
    describe();
  }
  showScore();
}

function act(intent) {
  audio.unlock();
  handle(intent);
  describe();
}

function handle(intent) {
  if (intent.type === 'mute') {
    audio.setMuted(!audio.isMuted());
    muteEl.textContent = audio.isMuted() ? 'Sound: off' : 'Sound: on';
    return;
  }
  if (replaying) return; // a replay is watched, not steered
  if (game.status === 'over') {
    if (intent.type === 'go' && performance.now() - overAt >= RESTART_GUARD_MS) {
      newGame();
      start(game);
      audio.play('start');
    }
    return;
  }
  if (intent.type === 'pause') {
    if (game.status === 'playing') paused = !paused;
    return;
  }
  if (paused) {
    if (intent.type === 'go') paused = false;
    return;
  }
  if (game.status === 'ready') {
    start(game);
    audio.play('start');
  }
  if (intent.type === 'turn' && turn(game, intent.dir)) audio.play('turn');
}

function frame(now) {
  if (!manualClock && lastFrame !== null && game.status === 'playing' && !paused) {
    carry += Math.min(now - lastFrame, 250);
    while (game.status === 'playing' && carry >= tickMs(game)) {
      carry -= tickMs(game);
      tick();
    }
  } else {
    carry = 0;
  }
  lastFrame = now;
  ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
  lastDrawn = drawFrame(ctx, {
    g: game, best, paused, muted: audio.isMuted(), replaying, now, sporeTicks: SPORE_TICKS,
  });
  window.requestAnimationFrame(frame);
}

// Size the canvas to the largest whole fit of the window, sharp on high-density screens.
function fit() {
  const bar = document.getElementById('bar').offsetHeight;
  const k = Math.min(window.innerWidth / VIEW_W, (window.innerHeight - bar) / VIEW_H);
  const w = Math.max(1, Math.floor(VIEW_W * k));
  const h = Math.max(1, Math.floor(VIEW_H * k));
  const density = window.devicePixelRatio || 1;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  canvas.width = Math.round(w * density);
  canvas.height = Math.round(h * density);
  pixelScale = canvas.width / VIEW_W;
}

const onControl = (e) => e.target === muteEl || e.target === replayEl;

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const intent = keyIntent(e.key);
  if (!intent) return;
  // Enter or Space on the focused sound button or replay link works that control, not the game.
  if (intent.type === 'go' && onControl(e)) return;
  e.preventDefault();
  if (e.repeat && intent.type !== 'turn') return;
  act(intent);
});

// One finger: a move of 24 px or more steers (and can steer again without lifting), a shorter touch is a tap.
// A mouse plays the same way with its left button only.
let finger = null;
window.addEventListener('pointerdown', (e) => {
  if (onControl(e) || finger) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  finger = { id: e.pointerId, x: e.clientX, y: e.clientY, steered: false };
});
window.addEventListener('pointermove', (e) => {
  if (!finger || e.pointerId !== finger.id) return;
  const dir = swipeDir(e.clientX - finger.x, e.clientY - finger.y);
  if (!dir) return;
  finger.x = e.clientX;
  finger.y = e.clientY;
  finger.steered = true;
  act({ type: 'turn', dir });
});
window.addEventListener('pointerup', (e) => {
  if (!finger || e.pointerId !== finger.id) return;
  if (!finger.steered) act({ type: 'go' });
  finger = null;
});
window.addEventListener('pointercancel', (e) => {
  if (finger && e.pointerId === finger.id) finger = null;
});

muteEl.addEventListener('click', (e) => {
  act({ type: 'mute' });
  // After a mouse or touch click, give the keys back to the game. A keyboard click (detail 0) keeps the focus.
  if (e.detail > 0) muteEl.blur();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && game.status === 'playing' && !replaying) paused = true;
  describe();
});
window.addEventListener('resize', fit);

// Read-only view for tests and for the curious. state() is a copy; changing it does not change the game.
window.__dewgrub = {
  version: VERSION,
  state() {
    const s = snapshot(game);
    s.paused = paused;
    s.muted = audio.isMuted();
    s.replaying = replaying;
    s.best = best;
    s.logText = encodeLog(game.log);
    return s;
  },
  drawn() { return lastDrawn.slice(); },
  sounds() { return { played: audio.played(), context: audio.contextState() }; },
  // Only with ?clock=manual: advance n ticks, exactly as the real clock would.
  step(n) {
    if (!manualClock) throw new Error('step() needs ?clock=manual');
    for (let i = 0; i < n && game.status === 'playing' && !paused; i++) tick();
    return this.state();
  },
};

newGame();
fit();
window.requestAnimationFrame(frame);
