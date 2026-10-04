// Dewgrub game logic. Pure: no DOM, no clock, no Math.random. Time is counted in ticks; the caller
// decides when to call step(). A run is fully described by (seed, turn log).

export const COLS = 20;
export const ROWS = 20;
export const SPORE_TICKS = 40;
export const SPORE_EVERY = 5;
export const DEW_POINTS = 10;
export const SPORE_POINTS = 50;

const DELTA = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
const OPPOSITE = { U: 'D', D: 'U', L: 'R', R: 'L' };

// FNV-1a, 32 bit. Used for string seeds and for the state hash.
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32. The generator state lives in the game state, so a snapshot carries it.
function nextRandom(g) {
  g.rng = (g.rng + 0x6d2b79f5) >>> 0;
  let t = g.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

function same(a, b) {
  return a !== null && b !== null && a.x === b.x && a.y === b.y;
}

// A random cell that holds neither grub, dew nor spore, or null when the grid is full.
function freeCell(g) {
  const taken = new Set(g.grub.map((c) => c.y * g.cols + c.x));
  if (g.dew) taken.add(g.dew.y * g.cols + g.dew.x);
  if (g.spore) taken.add(g.spore.y * g.cols + g.spore.x);
  const total = g.cols * g.rows;
  const freeCount = total - taken.size;
  if (freeCount <= 0) return null;
  let n = nextRandom(g) % freeCount;
  for (let i = 0; i < total; i++) {
    if (taken.has(i)) continue;
    if (n === 0) return { x: i % g.cols, y: Math.floor(i / g.cols) };
    n--;
  }
  return null;
}

export function parseSeed(text) {
  if (text === null || text === undefined || text === '') return null;
  const s = String(text);
  if (/^\d+$/.test(s)) return Number(BigInt(s) % 4294967296n);
  return fnv1a(s);
}

export function createGame(seed) {
  const cx = Math.floor(COLS / 2);
  const cy = Math.floor(ROWS / 2);
  const g = {
    cols: COLS,
    rows: ROWS,
    seed: seed >>> 0,
    rng: seed >>> 0,
    grub: [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }],
    dir: 'R',
    queue: [],
    dew: null,
    spore: null,
    score: 0,
    tick: 0,
    status: 'ready',
    cause: null,
    dewEaten: 0,
    sporesEaten: 0,
    log: [],
  };
  g.dew = freeCell(g);
  return g;
}

export function start(g) {
  if (g.status === 'ready') g.status = 'playing';
}

// Ask for a turn. Returns true if it was accepted (and logged), false if it was rejected.
export function turn(g, d) {
  if (g.status === 'over' || !DELTA[d]) return false;
  const last = g.queue.length ? g.queue[g.queue.length - 1] : g.dir;
  if (d === last || d === OPPOSITE[last] || g.queue.length >= 2) return false;
  g.queue.push(d);
  g.log.push({ t: g.tick, d });
  return true;
}

function end(g, cause, events) {
  g.status = 'over';
  g.cause = cause;
  events.push('over');
  return events;
}

// Advance one tick. Returns the list of things that happened, for the sounds.
export function step(g) {
  const events = [];
  if (g.status !== 'playing') return events;
  g.tick++;
  if (g.queue.length) g.dir = g.queue.shift();
  const head = { x: g.grub[0].x + DELTA[g.dir][0], y: g.grub[0].y + DELTA[g.dir][1] };
  if (head.x < 0 || head.x >= g.cols || head.y < 0 || head.y >= g.rows) return end(g, 'wall', events);

  const grows = same(head, g.dew);
  // The tail cell is leaving on this step, so it does not count as body unless the grub grows.
  const body = grows ? g.grub : g.grub.slice(0, -1);
  if (body.some((c) => same(c, head))) return end(g, 'self', events);

  g.grub.unshift(head);
  if (!grows) g.grub.pop();

  if (g.spore) {
    if (same(head, g.spore)) {
      g.spore = null;
      g.score += SPORE_POINTS;
      g.sporesEaten++;
      events.push('spore');
    } else if (--g.spore.ttl <= 0) {
      g.spore = null;
      events.push('spore-gone');
    }
  }

  if (grows) {
    g.score += DEW_POINTS;
    g.dewEaten++;
    events.push('eat');
    g.dew = null;
    g.dew = freeCell(g);
    if (!g.dew) return end(g, 'full', events);
    if (g.dewEaten % SPORE_EVERY === 0 && !g.spore) {
      const c = freeCell(g);
      if (c) {
        g.spore = { x: c.x, y: c.y, ttl: SPORE_TICKS };
        events.push('spore-appear');
      }
    }
  }
  return events;
}

export function tickMs(g) {
  return Math.max(70, 150 - 8 * Math.floor(g.dewEaten / 3));
}

export function stateHash(g) {
  const parts = [
    g.cols, g.rows, g.seed, g.rng, g.dir, g.queue.join(''), g.status, g.cause, g.score, g.tick,
    g.dewEaten, g.sporesEaten,
    g.dew ? `${g.dew.x},${g.dew.y}` : '-',
    g.spore ? `${g.spore.x},${g.spore.y},${g.spore.ttl}` : '-',
    g.grub.map((c) => `${c.x},${c.y}`).join(';'),
  ];
  return fnv1a(parts.join('|')).toString(16).padStart(8, '0');
}

// A deep copy plus the derived values a viewer needs. Changing it does not change the game.
export function snapshot(g) {
  const copy = JSON.parse(JSON.stringify(g));
  copy.hash = stateHash(g);
  copy.tickMs = tickMs(g);
  return copy;
}

// Play a whole game from a seed and a turn log. After the last logged turn the grub keeps going
// straight, so it reaches a wall and the game always ends.
export function replay(seed, log) {
  const g = createGame(seed);
  start(g);
  let i = 0;
  const limit = (log.length ? log[log.length - 1].t : 0) + g.cols * g.rows + 2;
  while (g.status === 'playing' && g.tick <= limit) {
    while (i < log.length && log[i].t === g.tick) turn(g, log[i++].d);
    step(g);
  }
  return g;
}

// "0U.10L": tick in base 36, then the direction letter, joined by dots.
export function encodeLog(log) {
  return log.map((e) => e.t.toString(36) + e.d).join('.');
}

export function decodeLog(text) {
  if (text === '') return [];
  let prev = 0;
  // The error carries the rejected entry as `entry`, so a caller can show a part of it instead of all of it.
  const reject = (why, part) => Object.assign(new Error(`${why}: "${part}"`), { entry: part });
  return String(text).split('.').map((part) => {
    const m = /^([0-9a-z]+)([UDLR])$/.exec(part);
    if (!m) throw reject('bad turn log entry', part);
    const t = parseInt(m[1], 36);
    if (!Number.isSafeInteger(t) || t < prev) throw reject('bad tick in turn log entry', part);
    prev = t;
    return { t, d: m[2] };
  });
}
