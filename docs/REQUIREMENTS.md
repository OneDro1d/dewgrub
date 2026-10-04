# Requirements — Dewgrub

Written before the tests and the code. Every rule has an id. Every id must appear in the name of at least one test
(`tools/trace.mjs` fails the build if one does not). Rules that no test here can prove are listed at the end as `NP-`.

Words: the **grub** is the player's creature. **Dew** is the normal food. A **spore** is the timed bonus. A **tick**
is one step of the game clock. The **turn log** is the list of accepted turns, each with the tick it was made on.

## Logic rules (run in Node, no browser)

| id | rule |
|---|---|
| R-L1 | Same seed and same turn log give the same state hash after every tick. Different seeds give a different first dew position for at least one of any 5 consecutive seeds. |
| R-L2 | A new game: 20×20 grid, grub of length 3 in the middle row heading right, status `ready`, score 0, tick 0, one dew on a free cell, no spore. |
| R-L3 | One step moves the head one cell in the current direction. Length stays the same unless dew was eaten on that step. Nothing moves while status is `ready`. |
| R-L4 | A turn takes effect on the next step. A turn into the opposite direction, or the same direction, is rejected. At most 2 turns wait in the queue; a third is rejected. A queued turn is checked against the turn before it, not against the current direction. |
| R-L5 | Moving the head outside the grid ends the game with cause `wall`. |
| R-L6 | Moving the head onto the grub's own body ends the game with cause `self`. Moving onto the cell the tail leaves on the same step is legal. |
| R-L7 | Eating dew: score +10, length +1, a new dew appears on a cell that is free (not grub, not spore). |
| R-L8 | After every 5th dew a spore appears on a free cell if none exists. It lasts 40 ticks. Eating it gives +50 and no growth. Unfilled, it disappears. |
| R-L9 | Tick length starts at 150 ms, drops 8 ms for every 3 dew eaten, and never goes below 70 ms. |
| R-L10 | After game over, `step` and `turn` change nothing. |
| R-L11 | When the grub fills the grid and no cell is free for dew, the game ends with cause `full`. |
| R-L12 | Every accepted turn is logged with its tick; rejected turns are not. `replay(seed, log)` reproduces the final state hash. The log encodes to a URL-safe string and decodes back unchanged; a malformed string is rejected. |
| R-L13 | Seed parsing: a string of digits is that number (mod 2^32); any other non-empty string is hashed to a number; missing or empty gives no seed. |
| R-L14 | Invariants hold on every tick of 200 seeded games, 100 played by a scripted player and 100 by random input: every grub cell is inside the grid, no two grub cells are equal while playing, dew and spore are never on the grub when placed, score = 10 × dew + 50 × spores, length = 3 + dew. |
| R-L15 | `step` reports what happened (`eat`, `spore`, `spore-appear`, `spore-gone`, `over`) so the page can play sounds without reading private state. |

## Presentation rules that need no browser

| id | rule |
|---|---|
| R-P1 | The pixel font is made here: every glyph is 5 cells high and 3 wide (M and W: 5 wide), no two glyphs are identical, and every character of every text the game draws has a glyph. |
| R-P2 | Every event of R-L15, plus `start` and `turn`, has a sound recipe made of oscillator notes: frequency 80–4000 Hz, total length at most 1 s, peak gain at most 0.3. |
| R-P3 | Key mapping: arrows and WASD steer; Space and Enter start or restart; P pauses; M mutes. Swipe mapping: a move of at least 24 px picks the dominant axis; a shorter move is a tap. |

## Browser rules (run in headless Chromium against the built `dist/index.html`)

| id | rule |
|---|---|
| R-B1 | The page loads with no console error and no uncaught exception, the title is "Dewgrub", and the canvas shows a drawing (more than 8 distinct colours). |
| R-B2 | Keyboard: with real key presses a game goes from `ready` to `playing` to `over`. Changed in v6: nothing moves before the first steer. Space or Enter only puts the start panel away; the first arrow or W A S D key starts the game. After game over, Space or Enter gives a new game with score 0 that again waits for the first steer; an arrow key does not. |
| R-B3 | Touch: on an emulated phone (390×844, touch on) with real touch events, swipes steer and the game reaches `over`. Changed in v6: a tap only puts the start panel away, the first swipe starts the game, and a tap after game over gives a new game that waits for the first swipe. |
| R-B4 | The score the player sees is the logic score: the on-page score text equals the state score after dew is eaten. |
| R-B5 | Seeded mode: two separate loads of `?seed=123` given the same key presses on the same ticks end with the same state hash. `?seed=124` puts the first dew somewhere else. Restart in seeded mode starts the same game again. |
| R-B6 | Replay: a scripted player plays a real-time game to game over. Node then replays `(seed, turn log)` and gets the same hash and score. The replay link the page offers plays back to the same hash in the browser. |
| R-B7 | No network: the page makes no request other than loading itself, carries a Content-Security-Policy with `default-src 'none'`, and the built file contains no `http://` or `https://` address and no call to a network API. |
| R-B8 | Sound: eating dew schedules the `eat` recipe on the page's own audio context; with mute on, nothing is scheduled. |
| R-B9 | Fit: at 390×844, 360×640, 844×390 and 320×568 the canvas and every item of the bar under it are inside the viewport, also with a four-digit score, and the page does not scroll. |
| R-B10 | The built file works opened from disk (`file://`): it loads and a game can be started. |
| R-B11 | Pause: P stops the clock (the tick does not advance for 600 ms) and P again resumes it. A hidden tab pauses the game. |
| R-B12 | Originality rules of the task that a machine can check: the built page and the README title contain none of the banned names, and the repository holds no image, audio or font file. |
| R-B13 | The two controls under the board behave as controls (added in v4, after the blind review): Enter or Space on the focused sound button toggles the sound and does not start a game; Enter on the focused replay link opens the replay; arrow keys still steer whatever has focus. Only the left mouse button plays: a right or middle click does nothing, a left click is a tap, a left drag is a swipe. |
| R-B14 | The board's accessible label says what is happening (added in v4, after the blind review): how to start, playing, paused, or game over with the cause and the score. The page does not forbid zooming. |
| R-B15 | Sub-path (added in v5): served from `http://<host>/dewgrub/` by a server that answers 404 everywhere else, the page loads, a seeded game plays to game over, and the replay link stays inside the sub-path and plays the same run back. |
| R-B16 | Fit for strangers (added in v5): no tracked file contains a home-folder path, a per-user temp path, the operator's name, or the internal names of the workspace the game was built in. The repository carries the MIT license and the README names it. Added in v6: no commit in the history carries a person's name or address as author or committer, and no commit message carries any of the above. |
| R-B17 | The page and the service agree (added in v6): the page served by `tools/serve.mjs` plays a seeded game, and the service, asked to replay that game's seed and turn log, answers the same final state hash and score as the page. |

## Service rules (added in v6; run in Node against `tools/serve.mjs`, see `docs/API.md`)

| id | rule |
|---|---|
| R-S1 | The service imports the game logic the page is built from and holds no copy of the rules. For 40 seeded games it ends in the same state as the logic. |
| R-S2 | `POST /api/replay` answers exactly the fields `seed`, `status`, `cause`, `score`, `dew`, `spores`, `length`, `ticks`, `hash`, after playing to one tick past the last logged turn or to game over. A game still running says `playing`. With `finish: true` it goes on straight to game over, as the page's replay does. |
| R-S3 | `POST /api/step` answers the same fields after exactly `ticks` ticks (or at game over, if earlier), plus `state`: grid size, grub cells head first, direction, dew cell, spore cell with its ticks left. Turns logged at that tick or later are not applied. |
| R-S4 | Every malformed request gets status 400 and `{"error": <code>, "message": ...}` with the documented code, and changes nothing. Limits: `ticks` at most 100000, body at most 65536 bytes. A fault inside the service answers 500 `internal_error` without the inner error text, and the service keeps serving. |
| R-S5 | An unknown path gets 404, also a path that tries to leave `dist/`. A wrong method on a known path gets 405 with an `Allow` header. Both are JSON errors. |
| R-S6 | Every response carries `X-Request-Id`: the caller's if it is 1 to 64 letters, digits or `-`, else a new one. One JSON log line per request on standard output, with the id, the method, the path without query, the status and the duration. |
| R-S7 | Stateless: the same request gets the same response body, byte for byte, alone, repeated, and among concurrent other requests. |
| R-S8 | The built page is served at `/` byte for byte. The service listens on `127.0.0.1` only, on the port from `PORT` (default 8787), and stops on SIGTERM. |
| R-S9 | `docs/API.md` names every error code and both limits and has a curl example for each endpoint. |

## Player rules (added in v6; run in Node against a FAKE model server, never the real one)

| id | rule |
|---|---|
| R-J1 | A move is `left`, `straight` or `right`, relative to the heading. The view a player is sent is plain data: grid, heading, head, body, dew, spore, score, tick, and for each move the cell it leads to, what it hits there and the distance to the dew after it. |
| R-J2 | `playGame` plays a seeded game with any player through the game logic; its turn log replays to the same state. The random player is seeded. A tick cap stops a game that is still alive and says so. |
| R-J3 | One decision of the Jev player is one POST to the model's endpoint with the key as a bearer token and the body `{state, model: "jev-latest", questions: {move: {type: "choice", instructions, criteria: {left, straight, right}}}}`. The transport is one function in one module. |
| R-J4 | A 429 or a 529 is retried with a growing wait, at most 3 times. A 401, a 422, any other status, a malformed answer and a timeout stop the run at once with a named error. |
| R-J5 | The budget: at most `--max-calls` requests per game (default 300), retries included. When it is spent the game stops and says so. |
| R-J6 | The key comes only from the environment variable `TYPESAFE_API_KEY`. Without it the tool exits with code 2, a clear message, and no request. The key never appears on standard output, on standard error or in the run record. |
| R-J7 | A run record is written per game: seed, model, turn log, score, ticks, calls, how it stopped, and per decision the move, the probabilities, the confidence, the response time and the attempts. The replay address is in the record and is printed. |
| R-J8 | The benchmark plays the same seeds with a random player, the scripted player and, only with a key, Jev: mean and median score, mean and median ticks, and how the games ended. It runs without any key, shows no number for Jev then, and keeps Jev inside a total budget. |

## Not provable by these tests

| id | claim nobody here can prove |
|---|---|
| NP-1 | It is fun. |
| NP-2 | It works on a real phone. Only an emulated phone viewport with touch events in desktop Chromium is tested. |
| NP-3 | It works in Firefox or Safari. Only Chromium is tested. |
| NP-4 | The sounds are pleasant, or audible at all. The tests see that notes are scheduled, not what comes out of a speaker. |
| NP-5 | The name is free of trademark claims. One web search was run; no register was checked. |
| NP-6 | The art looks good. The tests see that the grub, the dew and the texts are drawn, not what they look like to a person. |
| NP-7 | A really hidden tab pauses the game. The test fakes the browser's "tab is hidden" signal; headless Chromium has no tab to hide. |
| NP-8 | It is usable with a screen reader. The label of R-B14 exists; nobody listened to it. |
| NP-9 | It works at its public address. R-B15 proves a sub-path on a local test server; the real host, its headers and its caching were not tested, because nothing was deployed. |
| NP-10 | The Jev player works with the real Jev model, and how well Jev plays. The real model was never called: the builder had no key. Every R-J rule is proven against a fake server written from the model's public API description. If the real API differs from that description, these tests do not notice. |
| NP-11 | The service passes the independent acceptance test. That test is written and kept by somebody else; the builder never saw it. |
| NP-12 | The first-steer start is easier for a first-time player. It removes the death before any steering; whether people find it clear was not tried with people. |
