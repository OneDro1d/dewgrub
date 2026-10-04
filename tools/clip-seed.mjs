// Finds a seed for the gameplay clip: the scripted player must eat at least 8 dew and one gold spore, then
// stop steering and hit a wall, in about 12 seconds (the clip shows the run twice: live, then replayed).
// Usage: node tools/clip-seed.mjs [how many seeds to try, default 3000] [seconds wanted, default 12]
//        node tools/clip-seed.mjs --seed 2194      (print the run of one seed)
// tools/clip.py plays by the same rule, so the run it records is the run printed here.
import { createGame, start, turn, step, snapshot, tickMs, encodeLog } from '../src/game.js';
import { chooseDir } from './bot.mjs';

export const CLIP_DEW = 8;
export const CLIP_SPORES = 1;

export function clipRun(seed) {
  const g = createGame(seed);
  start(g);
  let ms = 0;
  while (g.status === 'playing' && g.tick < 400) {
    if (g.dewEaten < CLIP_DEW || g.sporesEaten < CLIP_SPORES) {
      const d = chooseDir(snapshot(g));
      if (d !== g.dir) turn(g, d);
    }
    ms += tickMs(g);
    step(g);
  }
  const ok = g.status === 'over' && g.dewEaten >= CLIP_DEW && g.sporesEaten >= CLIP_SPORES;
  return { seed, ok, ticks: g.tick, seconds: ms / 1000, dew: g.dewEaten, spores: g.sporesEaten, score: g.score, cause: g.cause, log: encodeLog(g.log) };
}

if (process.argv[2] === '--seed') {
  // The run of one given seed, for tools/clip.py to compare its recording with.
  console.log(JSON.stringify(clipRun(Number(process.argv[3]))));
} else if (process.argv[1] && process.argv[1].endsWith('clip-seed.mjs')) {
  const tries = Number(process.argv[2] || 3000);
  const wanted = Number(process.argv[3] || 12); // seconds of play: twice that plus the panels is a 35 to 40 s clip
  let best = null;
  for (let seed = 1; seed <= tries; seed++) {
    const r = clipRun(seed);
    if (r.ok && (!best || Math.abs(r.seconds - wanted) < Math.abs(best.seconds - wanted))) best = r;
  }
  console.log(JSON.stringify(best));
}
