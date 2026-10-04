// Replays a run in Node, with no browser, and compares the result with what the browser reported.
// Usage: node tools/replay-check.mjs <seed> <turn log text> <expected hash> <expected score>
// Exit code 0 when both match.
import { replay, decodeLog, stateHash } from '../src/game.js';

const [seed, logText, wantHash, wantScore] = process.argv.slice(2);
const g = replay(Number(seed), decodeLog(logText || ''));
const hash = stateHash(g);
console.log(`replayed seed ${seed}: ${g.tick} ticks, score ${g.score}, cause ${g.cause}, hash ${hash}`);
if (hash !== wantHash || String(g.score) !== String(wantScore)) {
  console.error(`MISMATCH: the browser reported hash ${wantHash}, score ${wantScore}`);
  process.exit(1);
}
console.log('MATCH');
