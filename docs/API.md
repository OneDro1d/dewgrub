# The local service and its API

`tools/serve.mjs` is a small HTTP service around the game logic, made so that a test harness (or a player script,
or a model) can drive the game over HTTP instead of through a browser. It uses Node's built-in modules only, and it
imports the same `src/game.js` the page is built from. There is no second copy of the rules.

    node tools/serve.mjs              # http://127.0.0.1:8787
    PORT=9000 node tools/serve.mjs    # another port; PORT=0 lets the system pick one

It listens on `127.0.0.1` only. It is not meant to be put on the internet. Stop it with Ctrl-C (or SIGTERM).

## What it serves

| path | method | what |
|---|---|---|
| `/` and `/index.html` | GET, HEAD | the built game page, `dist/index.html`, byte for byte |
| `/api/replay` | POST | play a seed and a turn log to the end of the log, return the result |
| `/api/step` | POST | play a seed and a turn log for exactly n ticks, return the result and the board |

Everything else is `404`. A wrong method on a known path is `405` with an `Allow` header.

The service is **stateless**: it keeps nothing between requests, and the same request always gets the same response
body, byte for byte.

## The turn log

The same text the page puts in its replay address (`?seed=123&replay=0D.7R`). Each entry is a tick number in base 36
(digits and lower-case letters) followed by one direction letter, `U`, `D`, `L` or `R`; entries are joined by dots,
in order of tick. `0D.7R` means: turn down before the first tick, turn right once 7 ticks have been played. An empty
string is a game with no turns. Tick 36 is written `10`.

A turn the game does not accept (a reversal, a repeat of the current direction, a third turn while two are waiting)
is skipped, exactly as the page skips it. That is not an error. A log that is malformed is an error (`bad_log`).

## POST /api/replay

Body: `{"seed": <integer 0 to 4294967295>, "log": "<turn log>"}`. Optional: `"finish": true`.

The game is played until **one tick after the last logged turn**, or until game over if that comes first. A game
that is still running then says `"status": "playing"`. An empty log plays 0 ticks.

With `"finish": true` the grub then keeps going straight until the game is over. That is what the page's replay does,
so with `finish` the result is the result the page's replay address ends on.

    curl -s -X POST http://127.0.0.1:8787/api/replay -d '{"seed": 123, "log": "0D.7R"}'

    {"seed":123,"status":"playing","cause":null,"score":0,"dew":0,"spores":0,"length":3,"ticks":8,"hash":"…"}

    curl -s -X POST http://127.0.0.1:8787/api/replay -d '{"seed": 123, "log": "0D.7R", "finish": true}'

    {"seed":123,"status":"over","cause":"wall","score":10,"dew":1,"spores":0,"length":4,"ticks":…,"hash":"…"}

| field | meaning |
|---|---|
| `seed` | the seed, as sent |
| `status` | `"playing"` or `"over"` |
| `cause` | `null` while playing; `"wall"`, `"self"` or `"full"` when over |
| `score` | 10 per dew, 50 per spore |
| `dew` | dew eaten |
| `spores` | spores eaten |
| `length` | cells of the grub |
| `ticks` | ticks played |
| `hash` | 8 hex digits, a hash of the whole game state; two games with the same hash are in the same state |

## POST /api/step

Body: `{"seed": <integer>, "log": "<turn log>", "ticks": <integer 0 to 100000>}`.

The game is played for **exactly `ticks` ticks**, or until game over if that comes first (`ticks` in the answer is
then the tick the game ended on). Turns logged at tick `ticks` or later are in the future and are not applied.

The answer has the fields of `/api/replay` plus `state`, which is what a player needs to choose the next turn:

    curl -s -X POST http://127.0.0.1:8787/api/step -d '{"seed": 123, "log": "0D", "ticks": 3}'

    {"seed":123,"status":"playing","cause":null,"score":0,"dew":0,"spores":0,"length":3,"ticks":3,"hash":"…",
     "state":{"cols":20,"rows":20,"dir":"D",
              "grub":[{"x":10,"y":13},{"x":10,"y":12},{"x":10,"y":11}],
              "dew":{"x":17,"y":17},"spore":null}}

| field of `state` | meaning |
|---|---|
| `cols`, `rows` | the size of the grid; `x` runs 0 to `cols`-1 left to right, `y` runs 0 to `rows`-1 top to bottom |
| `dir` | the direction the grub is moving: `U`, `D`, `L` or `R` |
| `grub` | the cells of the grub, head first |
| `dew` | the cell of the dew (or `null` when the grid is full) |
| `spore` | `null`, or `{"x", "y", "ticksLeft"}`: the gold spore and how many ticks it will stay |

To play: ask for the state after n ticks, choose a turn, add `<n in base 36><letter>` to the log, ask for n+1.

## Errors

Every error has the body `{"error": "<code>", "message": "<a sentence for a person>"}`. A request that gets an error
changes nothing (there is nothing to change: the service keeps no state).

| status | code | when |
|---|---|---|
| 400 | `bad_json` | the body is not valid JSON (an empty body too) |
| 400 | `bad_body` | the body is JSON but not an object |
| 400 | `missing_field` | `seed` or `log` is missing, or `ticks` on `/api/step` |
| 400 | `bad_seed` | `seed` is not an integer from 0 to 4294967295 (a number in a string is not an integer) |
| 400 | `bad_log` | `log` is not a string, or the game logic rejects it as a turn log |
| 400 | `bad_ticks` | `ticks` is not an integer from 0 to 100000 |
| 400 | `bad_finish` | `finish` is present and not `true` or `false` |
| 400 | `body_too_large` | the body is larger than 65536 bytes |
| 404 | `not_found` | no such path |
| 405 | `method_not_allowed` | the path exists but not with this method; see the `Allow` header |
| 500 | `internal_error` | a fault of the service itself. The message never carries the inner error. The tests found no real request that causes it; they provoke it through a failing route that only the test adds. |

Checks are made in this order: size, JSON, object, missing fields, seed, log, ticks, finish. So a body with a bad
seed and a bad log answers `bad_seed`.

## Limits

- `ticks`: 0 to **100000**.
- Body: at most **65536** bytes.
- `seed`: 0 to 4294967295. The page accepts larger numbers and wraps them; the API does not, it answers `bad_seed`.

## Request ids and the log

Every response carries `X-Request-Id`. If the request sent an `X-Request-Id` made of letters, digits and `-`, 1 to 64
characters long, that value comes back. Otherwise the service makes a new one.

The service writes one JSON line per request on its standard output:

    {"time":"2026-10-04T16:00:00.000Z","id":"Run-42","method":"POST","path":"/api/step","status":200,"ms":0.412}

`path` is the path without the query string. `ms` is the time the request took, in milliseconds. When it starts it
writes one line of another kind: `{"time":"…","event":"listening","host":"127.0.0.1","port":8787}`.

## Other response headers

`Content-Type: application/json; charset=utf-8` on API answers and errors, `text/html; charset=utf-8` on the page,
`Cache-Control: no-store` on everything.
