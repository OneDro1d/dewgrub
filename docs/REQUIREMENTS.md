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
| R-L14 | Invariants hold on every tick of 200 seeded games played by a scripted player and by random input: every grub cell is inside the grid, no two grub cells are equal while playing, dew and spore are never on the grub when placed, score = 10 × dew + 50 × spores, length = 3 + dew. |
| R-L15 | `step` reports what happened (`eat`, `spore`, `spore-appear`, `spore-gone`, `over`) so the page can play sounds without reading private state. |

## Presentation rules that need no browser

| id | rule |
|---|---|
| R-P1 | The pixel font is made here: every glyph is 3×5 cells, no two glyphs are identical, and every character of every text the game draws has a glyph. |
| R-P2 | Every event of R-L15, plus `start` and `turn`, has a sound recipe made of oscillator notes: frequency 80–4000 Hz, total length at most 1 s, peak gain at most 0.3. |
| R-P3 | Key mapping: arrows and WASD steer; Space and Enter start or restart; P pauses; M mutes. Swipe mapping: a move of at least 24 px picks the dominant axis; a shorter move is a tap. |

## Browser rules (run in headless Chromium against the built `dist/index.html`)

| id | rule |
|---|---|
| R-B1 | The page loads with no console error and no uncaught exception, the title is "Dewgrub", and the canvas shows a drawing (more than 8 distinct colours). |
| R-B2 | Keyboard: with real key presses a game goes from `ready` to `playing` to `over`, and Space starts a new game with score 0. |
| R-B3 | Touch: on an emulated phone (390×844, touch on) with real touch events, a tap starts, swipes steer, the game reaches `over`, and a tap restarts. |
| R-B4 | The score the player sees is the logic score: the on-page score text equals the state score after dew is eaten. |
| R-B5 | Seeded mode: two separate loads of `?seed=123` given the same key presses on the same ticks end with the same state hash. `?seed=124` puts the first dew somewhere else. Restart in seeded mode starts the same game again. |
| R-B6 | Replay: a scripted player plays a real-time game to game over. Node then replays `(seed, turn log)` and gets the same hash and score. The replay link the page offers plays back to the same hash in the browser. |
| R-B7 | No network: the page makes no request other than loading itself, carries a Content-Security-Policy with `default-src 'none'`, and the built file contains no `http://` or `https://` address and no call to a network API. |
| R-B8 | Sound: eating dew schedules the `eat` recipe on the page's own audio context; with mute on, nothing is scheduled. |
| R-B9 | Fit: at 390×844, 360×640 and 844×390 the whole canvas is inside the viewport and the page does not scroll. |
| R-B10 | The built file works opened from disk (`file://`): it loads and a game can be started. |
| R-B11 | Pause: P stops the clock (the tick does not advance for 600 ms) and P again resumes it. A hidden tab pauses the game. |
| R-B12 | Originality rules of the brief that a machine can check: the built page and the README title contain none of the banned names, and the repository holds no image, audio or font file. |

## Not provable by these tests

| id | claim nobody here can prove |
|---|---|
| NP-1 | It is fun. |
| NP-2 | It works on a real phone. Only an emulated phone viewport with touch events in desktop Chromium is tested. |
| NP-3 | It works in Firefox or Safari. Only Chromium is tested. |
| NP-4 | The sounds are pleasant, or audible at all. The tests see that notes are scheduled, not what comes out of a speaker. |
| NP-5 | The name is free of trademark claims. One web search was run; no register was checked. |
| NP-6 | The art looks good. The tests see that something is drawn, not what it looks like to a person. |
