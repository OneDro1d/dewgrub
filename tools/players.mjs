// Players that play the game through the game logic directly (no browser, no HTTP).
// A player is a function decide(view, game) that answers 'left', 'straight' or 'right' (or an object with a
// `move` field, or null to give up). playGame() runs one seeded game with any such player.
import { createGame, start, turn, step, snapshot, stateHash, encodeLog } from '../src/game.js';
import { chooseDir } from './bot.mjs';

export const MOVES = ['left', 'straight', 'right'];

const DELTA = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
const TO_LEFT = { U: 'L', L: 'D', D: 'R', R: 'U' };
const TO_RIGHT = { U: 'R', R: 'D', D: 'L', L: 'U' };
const WORD = { U: 'up', D: 'down', L: 'left', R: 'right' };

function absolute(heading, move) {
  if (move === 'left') return TO_LEFT[heading];
  if (move === 'right') return TO_RIGHT[heading];
  if (move === 'straight') return heading;
  throw new Error(`not a move: ${move}`);
}

// Turn the grub by a move relative to where it is heading.
export function applyMove(g, move) {
  const dir = absolute(g.dir, move);
  if (dir !== g.dir) turn(g, dir);
}

// The move that takes a heading to a direction. A reversal is not a move.
export function relativeMove(heading, dir) {
  for (const move of MOVES) {
    if (absolute(heading, move) === dir) return move;
  }
  throw new Error(`${dir} is not reachable from ${heading} in one move`);
}

// What a player is told: plain data, no reference into the game.
export function viewOf(g) {
  const head = g.grub[0];
  const bodyCells = new Set(g.grub.slice(0, -1).map((c) => `${c.x},${c.y}`)); // the tail cell is about to be free
  const moves = {};
  for (const move of MOVES) {
    const [dx, dy] = DELTA[absolute(g.dir, move)];
    const cell = { x: head.x + dx, y: head.y + dy };
    let hits = 'nothing';
    if (cell.x < 0 || cell.x >= g.cols || cell.y < 0 || cell.y >= g.rows) hits = 'wall';
    else if (bodyCells.has(`${cell.x},${cell.y}`)) hits = 'body';
    else if (g.dew && g.dew.x === cell.x && g.dew.y === cell.y) hits = 'dew';
    else if (g.spore && g.spore.x === cell.x && g.spore.y === cell.y) hits = 'spore';
    moves[move] = { cell, hits, dewDistance: g.dew ? Math.abs(g.dew.x - cell.x) + Math.abs(g.dew.y - cell.y) : null };
  }
  return {
    grid: { cols: g.cols, rows: g.rows },
    heading: WORD[g.dir],
    head: { x: head.x, y: head.y },
    body: g.grub.slice(1).map((c) => ({ x: c.x, y: c.y })),
    dew: g.dew ? { x: g.dew.x, y: g.dew.y } : null,
    spore: g.spore ? { x: g.spore.x, y: g.spore.y, ticksLeft: g.spore.ttl } : null,
    score: g.score,
    tick: g.tick,
    moves,
  };
}

// Play one seeded game. Stops at game over ('over'), at maxTicks ('cap'), when the player gives up by
// answering null ('budget'), or when the player throws an error that carries a code ('error').
export async function playGame(seed, decide, { maxTicks = 5000 } = {}) {
  const g = createGame(seed);
  start(g);
  const decisions = [];
  const usage = { input_tokens: 0, output_tokens: 0 };
  let stoppedBy = 'over';
  let error = null;
  while (g.status === 'playing') {
    if (g.tick >= maxTicks) { stoppedBy = 'cap'; break; }
    let answer;
    try {
      answer = await decide(viewOf(g), g);
    } catch (e) {
      if (!e || !e.code) throw e;
      stoppedBy = 'error';
      error = { code: e.code, status: e.status === undefined ? null : e.status, message: e.message };
      break;
    }
    if (answer === null) { stoppedBy = 'budget'; break; }
    const { usage: used, ...rest } = typeof answer === 'string' ? { move: answer } : answer;
    if (used) {
      usage.input_tokens += used.input_tokens || 0;
      usage.output_tokens += used.output_tokens || 0;
    }
    decisions.push({ tick: g.tick, ...rest });
    applyMove(g, rest.move);
    step(g);
  }
  return {
    seed: g.seed, log: encodeLog(g.log), hash: stateHash(g), score: g.score, ticks: g.tick, dew: g.dewEaten,
    spores: g.sporesEaten, length: g.grub.length, status: g.status, cause: g.cause, stoppedBy, error, decisions, usage,
  };
}

// A player that picks one of the three moves at random, from its own seeded generator.
export function randomPlayer(seed) {
  let r = (Math.imul(seed >>> 0, 2654435761) ^ 0x9e3779b9) >>> 0;
  return () => {
    r = (Math.imul(r, 1664525) + 1013904223) >>> 0;
    return MOVES[(r >>> 16) % 3];
  };
}

// The scripted player of tools/bot.mjs, answering in relative moves.
export function scriptedPlayer() {
  return (view, g) => relativeMove(g.dir, chooseDir(snapshot(g)));
}
