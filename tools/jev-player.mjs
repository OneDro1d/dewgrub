// Plays one seeded game by asking the Jev model for every move. The game runs through the game logic directly.
//
// Usage: TYPESAFE_API_KEY=... node tools/jev-player.mjs --seed 123 [--max-calls 300] [--out .tmp/jev]
//
// The key is read from the environment variable TYPESAFE_API_KEY and from nowhere else. It is sent to the model's
// API as the request's credential and is never printed, logged or written to a file. Without it: exit code 2.
// TYPESAFE_API_URL sends the requests somewhere else (the tests point it at a fake server).
//
// Each decision is one request: the board as `state`, and one `choice` question (left, straight, right).
// A run record goes to <out>/<seed>.json: seed, turn log, score, and per decision the choice, the
// probabilities, the confidence and the response time. The replay address for the page is printed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOVES, playGame } from './players.mjs';
import { askJev, JEV_URL, JEV_MODEL } from './jev-transport.mjs';

export const DEFAULT_MAX_CALLS = 300;
export const MAX_RETRIES = 3;
const BACKOFF_MS = 500; // then 1000, then 2000

// The one question asked on every move.
export const QUESTION = {
  move: {
    type: 'choice',
    instructions: 'You steer a grub on a grid. It moves one cell per tick in the direction it is heading. '
      + 'Eating the dew scores 10 and makes the grub one cell longer; eating the gold spore scores 50 while it lasts. '
      + 'Moving into a wall or into the grub\'s own body ends the game. `state.moves` says what each of the three '
      + 'moves runs into on the next tick and how far the dew is after it. Choose the move for this tick that '
      + 'keeps the grub alive and scores the most over the whole game.',
    criteria: {
      left: 'Turn left, relative to the direction the grub is heading.',
      straight: 'Keep going straight.',
      right: 'Turn right, relative to the direction the grub is heading.',
    },
  },
};

export class JevError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// A count of calls that may not be exceeded. A budget with a parent spends from both.
export class Budget {
  constructor(max, parent = null) {
    this.max = max;
    this.used = 0;
    this.parent = parent;
  }

  get left() {
    const own = this.max - this.used;
    return this.parent ? Math.min(own, this.parent.left) : own;
  }

  take() {
    if (this.left <= 0) return false;
    this.used++;
    if (this.parent) this.parent.take();
    return true;
  }
}

const sleepFor = (ms) => new Promise((done) => setTimeout(done, ms));

// Makes the player function. It answers { move, probabilities, confidence, ms, attempts, usage },
// or null when the budget is spent, or throws a JevError when the model's answer cannot be used.
export function makeJevDecider({ key, budget, url = JEV_URL, timeoutMs = 30000, sleep = sleepFor, transport = askJev }) {
  return async function decide(view) {
    let ms = 0;
    for (let attempt = 1; attempt <= 1 + MAX_RETRIES; attempt++) {
      if (!budget.take()) return null;
      const r = await transport({ key, url, timeoutMs, state: view, questions: QUESTION, model: JEV_MODEL });
      ms += r.ms;
      if (r.failure === 'timeout') throw new JevError('timeout', `no answer within ${timeoutMs} ms`, 0);
      if (r.failure) throw new JevError('network', 'the request did not reach the model', 0);
      if (r.status === 429 || r.status === 529) {
        if (attempt > MAX_RETRIES) {
          throw new JevError(r.status === 429 ? 'rate_limited' : 'overloaded', `still status ${r.status} after ${MAX_RETRIES} retries`, r.status);
        }
        await sleep(BACKOFF_MS * 2 ** (attempt - 1));
        continue;
      }
      if (r.status === 401) throw new JevError('unauthorized', 'the model refused the credential (status 401)', 401);
      if (r.status === 422) throw new JevError('rejected', 'the model rejected the request as invalid (status 422)', 422);
      if (r.status !== 200) throw new JevError('http_error', `unexpected status ${r.status}`, r.status);
      const a = r.body && r.body.answers && r.body.answers.move;
      if (!a || !MOVES.includes(a.choice)) throw new JevError('malformed', 'the answer has no usable choice for the move', 200);
      return {
        move: a.choice,
        probabilities: a.probabilities === undefined ? null : a.probabilities,
        confidence: a.confidence === undefined ? null : a.confidence,
        ms,
        attempts: attempt,
        usage: r.body.usage || null,
      };
    }
    return null;
  };
}

function option(args, name, fallback) {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
}

// Run as a program.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const args = process.argv.slice(2);
  const seed = Number(option(args, '--seed', NaN));
  const maxCalls = Number(option(args, '--max-calls', DEFAULT_MAX_CALLS));
  const out = resolve(option(args, '--out', join(root, '.tmp', 'jev')));
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295 || !Number.isInteger(maxCalls) || maxCalls < 1) {
    console.error('usage: TYPESAFE_API_KEY=... node tools/jev-player.mjs --seed <0..4294967295> [--max-calls <n>] [--out <folder>]');
    process.exit(2);
  }
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) {
    console.error('TYPESAFE_API_KEY is not set. The Jev player needs a key in that environment variable and takes it from nowhere else. Nothing was sent.');
    process.exit(2);
  }
  const budget = new Budget(maxCalls);
  const decide = makeJevDecider({ key, budget, url: process.env.TYPESAFE_API_URL || JEV_URL });
  const game = await playGame(seed, decide, { maxTicks: Infinity });
  const replay = `dist/index.html?seed=${game.seed}&replay=${game.log}`;
  const record = {
    seed: game.seed, model: JEV_MODEL, maxCalls, calls: budget.used, stoppedBy: game.stoppedBy, error: game.error,
    status: game.status, cause: game.cause, score: game.score, ticks: game.ticks, dew: game.dew, spores: game.spores,
    length: game.length, hash: game.hash, log: game.log, replay,
    replayNote: game.status === 'over'
      ? 'The replay address plays this game to its end.'
      : 'This game was stopped before it ended. The replay address plays the logged turns and then goes straight on, so its ending is not part of this run.',
    usage: game.usage, decisions: game.decisions,
  };
  mkdirSync(out, { recursive: true });
  const file = join(out, `${game.seed}.json`);
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`seed ${game.seed}: score ${game.score}, ${game.ticks} ticks, ${budget.used} calls of ${maxCalls}`);
  if (game.stoppedBy === 'over') console.log(`game over: ${game.cause}`);
  if (game.stoppedBy === 'budget') console.log(`stopped: the budget of ${maxCalls} calls is spent and the grub was still alive`);
  if (game.stoppedBy === 'error') console.error(`stopped by an error: ${game.error.code} (${game.error.message})`);
  console.log(`run record: ${file}`);
  console.log(`replay: ${replay}`);
  process.exit(game.stoppedBy === 'error' ? 1 : 0);
}
