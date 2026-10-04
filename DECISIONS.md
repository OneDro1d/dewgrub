# Decisions

Newest last. Each one says what was chosen, what was rejected, and why.

## D1 — Mechanic: snake-like (4 Oct 2026)

Chosen: a grid game where a growing creature is steered to food and dies on a wall or on itself.

Rejected: brick-breaker-like and asteroids-like.

Why:
- The whole game state is a handful of integers on a grid. There is no floating-point physics, so "the same seed and
  the same inputs give the same run" can be proven exactly instead of approximately.
- Four directions map onto four arrow keys and four swipe directions with nothing left over. The other two mechanics
  need a continuous paddle or a rotate-and-thrust control, which is harder to make equal on keyboard and touch.
- A viewer understands it in one glance, which the brief asks for.
- It fits one working session with room left for the evidence, which is the actual showcase.

## D2 — Name: Dewgrub (4 Oct 2026)

A grub that eats dew drops. "Mosswyrm" was the first choice and was dropped because a web search found an existing
itch.io game with that name. One web search for `"Dewgrub" game` returned no game with that name. That is a single
search, not a trademark register check (see "What is not proven" in the README).

## D3 — No dependencies in the game, none in the unit tests (4 Oct 2026)

The game is plain JavaScript modules. Unit tests use Node's built-in test runner. The browser tests use the Playwright
install that already exists on the build machine. Nothing is downloaded by the build or by the game.

## D4 — One built file, `dist/index.html` (4 Oct 2026)

The source is ES modules so Node can test the logic. Browsers refuse to load ES modules from `file://`, so a scripted
build (`tools/build.mjs`) joins the modules into one self-contained HTML file that opens by double-click and can be
hosted anywhere as a single file. The built file is committed, and a check fails if it is out of date with the source.

## D5 — Time is counted in ticks, never in milliseconds, inside the logic (4 Oct 2026)

The logic advances only when `step()` is called. The browser decides when to call it. Every accepted turn is logged
with the tick it was made on. So a run is fully described by `(seed, turn log)`, and replaying it does not depend on
how fast the machine or the player was.

## D6 — Test hooks that ship in the game (4 Oct 2026)

`window.__dewgrub` exposes a read-only snapshot of the state and the sound log. `?clock=manual` stops the real-time
clock and lets a test advance ticks one by one. They ship in the built page because the tests must run against the
same file a player gets. They cannot change the score: the snapshot is a copy, and manual stepping only does what the
real clock would do.

## D7 — Tests must be seen failing (4 Oct 2026)

A test that has only ever passed has not been shown to check anything. `tools/mutate.mjs` breaks the logic and
`tools/mutate-page.mjs` breaks the page, one small fault at a time, and each fault must make a test fail. The first
runs found three holes (two in the unit tests, one in the browser tests), which were closed. Both scripts are part of
`./check.sh`. Rejected: trusting coverage of rules by test names alone (`tools/trace.mjs`), which shows that a test
exists, not that it bites.

## D8 — A review finding is a claim until a test fails for it (4 Oct 2026)

Every finding of the blind review was first turned into a test and run against the unfixed page
(`evidence/v4/red-output.txt`). Only then was the page changed. Findings that could not be tested here are listed as
not proven instead of being marked fixed.

## D9 — M and W are five cells wide (4 Oct 2026)

At three cells wide the W in the title read as an H in screenshots, twice. The font now has two widths. Rejected:
keeping a uniform 3×5 font for simplicity; the name of the game has to be readable.
