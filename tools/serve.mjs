// A local HTTP service around the game logic: the built page at /, and a JSON API under /api/.
// Node built-ins only. It imports the same game logic the page is built from; there is no second copy of the rules.
// Usage: node tools/serve.mjs            listens on 127.0.0.1, port from PORT (default 8787)
// Documented in docs/API.md.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGame, start, turn, step, stateHash, decodeLog } from '../src/game.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULT_PORT = 8787;
export const HOST = '127.0.0.1';
export const LIMITS = { ticks: 100000, bodyBytes: 65536 };
export const ERROR_CODES = [
  'bad_json', 'bad_body', 'missing_field', 'bad_seed', 'bad_log', 'bad_ticks', 'bad_finish', 'body_too_large',
  'not_found', 'method_not_allowed', 'internal_error',
];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };

// No error body and no log line grows with what the caller sent: both are at most bodyBytes bytes, and a value
// from the caller is shown up to `quoted` characters, then "…".
export const ERROR_LIMITS = { bodyBytes: 512, quoted: 40 };

export class Refusal extends Error {
  constructor(status, code, message, headers = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}
const bad = (code, message) => new Refusal(400, code, message);
const clip = (value) => {
  const text = String(value);
  return text.length > ERROR_LIMITS.quoted ? `${text.slice(0, ERROR_LIMITS.quoted)}…` : text;
};

// Reads the whole body, or refuses once it is larger than the limit.
function readBody(req) {
  return new Promise((done, fail) => {
    const chunks = [];
    let size = 0;
    let refused = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > LIMITS.bodyBytes) {
        refused = true; // keep reading and dropping, so the answer can still be sent on this connection
        chunks.length = 0;
      } else if (!refused) {
        chunks.push(chunk);
      }
    });
    req.on('end', () => {
      if (refused) fail(bad('body_too_large', `the body is larger than ${LIMITS.bodyBytes} bytes`));
      else done(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', fail);
  });
}

// Checks one request body. Returns { seed, log, ticks, finish } or throws a Refusal.
function parseRequest(text, needsTicks) {
  let body;
  try { body = JSON.parse(text); } catch (e) { throw bad('bad_json', 'the body is not valid JSON'); }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw bad('bad_body', 'the body must be a JSON object');
  for (const field of needsTicks ? ['seed', 'log', 'ticks'] : ['seed', 'log']) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) throw bad('missing_field', `the field "${field}" is missing`);
  }
  if (!Number.isInteger(body.seed) || body.seed < 0 || body.seed > 4294967295) {
    throw bad('bad_seed', 'seed must be an integer from 0 to 4294967295');
  }
  if (typeof body.log !== 'string') throw bad('bad_log', 'log must be a string, for example "0D.7R"');
  let log;
  try { log = decodeLog(body.log); } catch (e) { throw bad('bad_log', `the game logic rejects this turn log, at the entry "${clip(e.entry)}"`); }
  let ticks = null;
  if (needsTicks) {
    ticks = body.ticks;
    if (!Number.isInteger(ticks) || ticks < 0 || ticks > LIMITS.ticks) {
      throw bad('bad_ticks', `ticks must be an integer from 0 to ${LIMITS.ticks}`);
    }
  }
  if (body.finish !== undefined && typeof body.finish !== 'boolean') throw bad('bad_finish', 'finish must be true or false');
  return { seed: body.seed, log, ticks, finish: body.finish === true };
}

// Plays a game from a seed and a turn log, with the game logic and nothing else.
// ticks = a number: stop after exactly that many ticks; turns logged at that tick or later are not applied.
// ticks = null:    stop one tick after the last logged turn (the end of the log).
// finish:          then keep going straight until the game is over, which is what the page's replay does.
// The game always stops at game over.
function play({ seed, log, ticks, finish }) {
  const g = createGame(seed);
  start(g);
  const until = ticks !== null ? ticks : (log.length ? log[log.length - 1].t + 1 : 0);
  let i = 0;
  while (g.status === 'playing' && g.tick < until) {
    while (i < log.length && log[i].t === g.tick) turn(g, log[i++].d);
    step(g);
  }
  if (finish) {
    while (g.status === 'playing') step(g);
  }
  return g;
}

function summary(g) {
  return {
    seed: g.seed, status: g.status, cause: g.cause, score: g.score, dew: g.dewEaten, spores: g.sporesEaten,
    length: g.grub.length, ticks: g.tick, hash: stateHash(g),
  };
}

function playerState(g) {
  return {
    cols: g.cols, rows: g.rows, dir: g.dir,
    grub: g.grub.map((c) => ({ x: c.x, y: c.y })),
    dew: g.dew ? { x: g.dew.x, y: g.dew.y } : null,
    spore: g.spore ? { x: g.spore.x, y: g.spore.y, ticksLeft: g.spore.ttl } : null,
  };
}

const API = {
  '/api/replay': async (req) => summary(play(parseRequest(await readBody(req), false))),
  '/api/step': async (req) => {
    const g = play(parseRequest(await readBody(req), true));
    return { ...summary(g), state: playerState(g) };
  },
};

async function staticFile(distDir, path) {
  const wanted = resolve(distDir, `.${path === '/' ? '/index.html' : path}`);
  if (wanted !== distDir && !wanted.startsWith(distDir + sep)) throw new Refusal(404, 'not_found', 'no such path');
  try {
    return { body: await readFile(wanted), type: TYPES[extname(wanted)] || 'application/octet-stream' };
  } catch (e) {
    throw new Refusal(404, 'not_found', 'no such path');
  }
}

async function answer(req, path, distDir, api) {
  if (Object.prototype.hasOwnProperty.call(api, path)) {
    if (req.method !== 'POST') throw new Refusal(405, 'method_not_allowed', `${path} takes POST`, { Allow: 'POST' });
    return { status: 200, type: TYPES['.json'], body: JSON.stringify(await api[path](req)) };
  }
  if (path === '/api' || path.startsWith('/api/')) throw new Refusal(404, 'not_found', 'no such path');
  const file = await staticFile(distDir, path);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    throw new Refusal(405, 'method_not_allowed', `${clip(path)} takes GET or HEAD`, { Allow: 'GET, HEAD' });
  }
  return { status: 200, type: file.type, body: file.body };
}

// The server, not yet listening. log(line) receives one JSON line per request.
// extraApi exists for the tests only: it lets a test add a route that fails, to see what a service fault looks like.
export function createApp({ distDir = join(root, 'dist'), log = (line) => process.stdout.write(`${line}\n`), extraApi = {} } = {}) {
  const dist = resolve(distDir);
  const api = { ...API, ...extraApi };
  return http.createServer(async (req, res) => {
    const began = process.hrtime.bigint();
    const sent = req.headers['x-request-id'];
    const id = typeof sent === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(sent) ? sent : randomUUID();
    let path = '/';
    let out;
    try {
      try { path = decodeURIComponent(new URL(req.url, 'http://local').pathname); } catch (e) { throw new Refusal(404, 'not_found', 'no such path'); }
      out = await answer(req, path, dist, api);
      out.headers = {};
    } catch (e) {
      // Anything that is not a refusal of the request is a fault of the service: say so, and keep serving.
      const r = e instanceof Refusal ? e : new Refusal(500, 'internal_error', 'the service failed on this request');
      req.resume(); // drop whatever body is left unread
      let body = JSON.stringify({ error: r.code, message: r.message });
      // The last guard: whatever a message was built from, the body stays within the limit.
      if (Buffer.byteLength(body) > ERROR_LIMITS.bodyBytes) body = JSON.stringify({ error: r.code, message: 'the request was refused' });
      out = { status: r.status, type: TYPES['.json'], body, headers: r.headers };
    }
    res.writeHead(out.status, {
      'Content-Type': out.type, 'Content-Length': Buffer.byteLength(out.body), 'Cache-Control': 'no-store',
      'X-Request-Id': id, ...out.headers,
    });
    res.end(req.method === 'HEAD' ? undefined : out.body);
    const ms = Number(process.hrtime.bigint() - began) / 1e6;
    log(JSON.stringify({ time: new Date().toISOString(), id, method: req.method, path: clip(path), status: out.status, ms: Math.round(ms * 1000) / 1000 }));
  });
}

// Run as a program.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = process.env.PORT === undefined || process.env.PORT === '' ? DEFAULT_PORT : Number(process.env.PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error(`PORT must be a number from 0 to 65535, not "${clip(process.env.PORT)}"`);
    process.exit(2);
  }
  // DEWGRUB_DIST serves another build of the page (the tests use it for deliberately broken pages).
  const server = createApp(process.env.DEWGRUB_DIST ? { distDir: process.env.DEWGRUB_DIST } : {});
  server.listen(port, HOST, () => {
    process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), event: 'listening', host: HOST, port: server.address().port })}\n`);
  });
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  server.on('error', (e) => {
    console.error(`cannot listen on ${HOST}:${port}: ${e.message}`);
    process.exit(1);
  });
}
