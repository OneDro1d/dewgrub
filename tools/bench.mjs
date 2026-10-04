// Plays the same seeds with three players and compares them: (1) a random player, (2) the scripted player,
// (3) the Jev model. Players 1 and 2 need no key. Jev is played only when TYPESAFE_API_KEY is set.
//
// Usage: node tools/bench.mjs [--seeds 20] [--max-calls 300] [--max-total-calls <seeds x max-calls>] [--json]
//
// Every player gets the same seeds (1..N) and the same cap: a game still alive after --max-calls ticks is stopped
// and counted under the cause "cap" (for Jev the cap is its call budget, so the cause is "budget").
// --max-total-calls is the budget for the whole benchmark: when it is spent, Jev plays no further game.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { playGame, randomPlayer, scriptedPlayer } from './players.mjs';
import { Budget, makeJevDecider, DEFAULT_MAX_CALLS } from './jev-player.mjs';
import { JEV_URL } from './jev-transport.mjs';

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const round = (x) => Math.round(x * 10) / 10;

export function summarise(player, games) {
  const causes = {};
  for (const g of games) {
    const cause = g.stoppedBy === 'over' ? g.cause : g.stoppedBy;
    causes[cause] = (causes[cause] || 0) + 1;
  }
  return {
    player, games: games.length,
    meanScore: round(mean(games.map((g) => g.score))), medianScore: median(games.map((g) => g.score)),
    meanTicks: round(mean(games.map((g) => g.ticks))), medianTicks: median(games.map((g) => g.ticks)),
    causes,
  };
}

function option(args, name, fallback) {
  const i = args.indexOf(name);
  return i === -1 ? fallback : Number(args[i + 1]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const count = option(args, '--seeds', 20);
  const maxCalls = option(args, '--max-calls', DEFAULT_MAX_CALLS);
  const maxTotal = option(args, '--max-total-calls', count * maxCalls);
  if (![count, maxCalls, maxTotal].every((n) => Number.isInteger(n) && n >= 1)) {
    console.error('usage: node tools/bench.mjs [--seeds <n>] [--max-calls <n>] [--max-total-calls <n>] [--json]');
    process.exit(2);
  }
  const seeds = Array.from({ length: count }, (_, i) => i + 1);
  const players = [];

  const random = [];
  const scripted = [];
  for (const seed of seeds) {
    random.push(await playGame(seed, randomPlayer(seed), { maxTicks: maxCalls }));
    scripted.push(await playGame(seed, scriptedPlayer(), { maxTicks: maxCalls }));
  }
  players.push(summarise('random', random), summarise('scripted', scripted));

  const result = { seeds, maxTicks: maxCalls, players };
  const key = process.env.TYPESAFE_API_KEY;
  let failure = null;
  if (key) {
    const total = new Budget(maxTotal);
    const jev = [];
    for (const seed of seeds) {
      if (total.left <= 0) break;
      const decide = makeJevDecider({ key, budget: new Budget(maxCalls, total), url: process.env.TYPESAFE_API_URL || JEV_URL });
      const game = await playGame(seed, decide, { maxTicks: Infinity });
      if (game.stoppedBy === 'error') { failure = game.error; break; }
      jev.push(game);
    }
    if (jev.length) players.push(summarise('jev', jev));
    result.jevCalls = total.used;
    result.jevBudgetSpent = total.left <= 0;
  }

  if (args.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${count} seeds (1..${count}), every game capped at ${maxCalls} ticks`);
    console.log('player   | games | mean score | median score | mean ticks | median ticks | how the games ended');
    for (const p of players) {
      const ends = Object.entries(p.causes).map(([c, n]) => `${c} ${n}`).join(', ');
      console.log(`${p.player.padEnd(8)} | ${String(p.games).padStart(5)} | ${String(p.meanScore).padStart(10)} | ${String(p.medianScore).padStart(12)} | ${String(p.meanTicks).padStart(10)} | ${String(p.medianTicks).padStart(12)} | ${ends}`);
    }
    if (!key) console.log('Jev: not run (TYPESAFE_API_KEY is not set). No number is shown for it.');
    else console.log(`Jev: ${result.jevCalls} calls of at most ${maxTotal}${result.jevBudgetSpent ? ' (the total budget is spent: later seeds were not played)' : ''}`);
  }
  if (failure) {
    console.error(`Jev stopped by an error: ${failure.code} (${failure.message})`);
    process.exit(1);
  }
}
