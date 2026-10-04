// Turns raw keys and finger moves into game intents. Pure, so it is tested without a browser.

export const SWIPE_MIN = 24;

const KEYS = {
  ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R',
  w: 'U', s: 'D', a: 'L', d: 'R',
  W: 'U', S: 'D', A: 'L', D: 'R',
};

// key is KeyboardEvent.key. Returns { type: 'turn', dir } | { type: 'go' | 'pause' | 'mute' } | null.
export function keyIntent(key) {
  if (Object.prototype.hasOwnProperty.call(KEYS, key)) return { type: 'turn', dir: KEYS[key] };
  if (key === ' ' || key === 'Enter') return { type: 'go' };
  if (key === 'p' || key === 'P') return { type: 'pause' };
  if (key === 'm' || key === 'M') return { type: 'mute' };
  return null;
}

// A finger move of (dx, dy) pixels. Returns a direction, or null when the move is too short (a tap).
export function swipeDir(dx, dy) {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'R' : 'L';
  return dy > 0 ? 'D' : 'U';
}
