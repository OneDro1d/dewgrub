# Blind review

**Who:** a separate read-only sub-agent (Claude Code `Agent` tool, type `general-purpose`), started on 4 Oct 2026
against tag `v3`. It was given the repository path and the rules below, and nothing else: no build notes, no list of
suspected weak spots, no access to the builder's working notes. It was forbidden to change the repository.

**What it was asked for:** real defects, each with file and line, the exact scenario, and the raw output of a probe
it actually ran. Anything it could not run had to be labelled "NOT REPRODUCED, reasoning only".

**What it used:** 24 tool calls, about 3.5 minutes. Its three probe scripts are kept in
`evidence/review-probes/` (`p1.mjs` for Node, `b1.py` and `b2.py` for the browser). One line in each was changed at
v5: the absolute path of the build machine became a path relative to the script (the originals are in git history
at tag `v4`). They still look for the browser where the build machine had it, so on another machine edit the
`found = ...` line. They point at `dist/index.html`, so with the v3 page they reproduce the findings and with a
later page they show the fixes.

**How its report was treated:** as a claim, not as a fact. For every finding the builder first wrote a test and ran
it against the unfixed v3 page. `evidence/v4/red-output.txt` is that run: all 5 new tests fail there. Only then was
the page changed.

Result: **4 defects confirmed and fixed, 1 finding accepted in part, 6 test weaknesses reported (4 fixed, 1 fixed by
rewording the rule, 1 rejected and listed as not proven). No defect in the game logic was found.**

## Findings

| # | severity (reviewer) | finding | verdict | what was done |
|---|---|---|---|---|
| 1 | medium | Enter or Space on the focused "Sound" button started a game instead of toggling the sound (`src/main.js`, keydown handler). | **Confirmed**, test failed on v3 | Fixed. New rule R-B13, test `test_R_B13_enter_and_space_on_the_sound_button_toggle_sound_and_do_not_start`. |
| 2 | medium | Enter on the focused replay link restarted the game instead of opening the replay (same handler). | **Confirmed**, test failed on v3 | Fixed. R-B13, test `test_R_B13_enter_on_the_replay_link_opens_the_replay`. |
| 3 | low | A right or middle mouse click started and restarted the game (`src/main.js`, pointer handlers). | **Confirmed**, test failed on v3 | Fixed: only the left button plays. R-B13, test `test_R_B13_only_the_left_mouse_button_plays` (which is also the first test of mouse play at all). |
| 4 | low | On a 320 px wide screen the bar under the board overflowed once the score had four digits (`src/style.css`, `#bar`). The reviewer simulated the score text and said so. | **Confirmed**, test failed on v3 | Fixed: shorter replay label, tighter spacing. R-B9 now includes 320×568 with a four-digit score. The test also simulates the score text, and says so. |
| 5 | low | `user-scalable=no` blocks zooming, and the canvas tells a screen reader nothing about the game state. Reviewer: "NOT REPRODUCED, reasoning only". | **Accepted in part** | `user-scalable=no` removed. The canvas label now states the status, cause and score (new rule R-B14, with a test). Whether that is enough for a screen-reader user was not tested by anyone: NP-8. |

Raw proof lines from the reviewer's probes (v3 page), copied from its report:

```
A after Enter on focused #mute: {"status": "playing", "tick": 0, "paused": false, "muted": false, "queue": [], "score": 0, "replaying": false} label: Sound: on
H Space on focused #mute: {"status": "playing", "tick": 0, "paused": false, "muted": false, "queue": [], "score": 0, "replaying": false} Sound: on
A2 after Enter on focused replay link: url= ?seed=123&clock=manual state= {"status": "playing", "tick": 0, "paused": false, "muted": false, "queue": [], "score": 0, "replaying": false}
F after right click: {"status": "playing", "tick": 0, "paused": false, "muted": false, "queue": [], "score": 0, "replaying": false}
320 wide Score 1230 [['score', -5, 80], ['mute', 92, 190], ['replay', 202, 325]]
```

## Weak tests the reviewer pointed at

| # | what it said | verdict | what was done |
|---|---|---|---|
| W1 | The R-L1 test runs the same scripted player twice. It shows the player repeats itself, not that a turn log decides the run. | **Accepted** | New unit test: a fixed turn log gives the same hashes twice, and a log that differs by one tick diverges exactly there. |
| W2 | R-L14 says 200 games per player type; the tests run 100 + 100. | **Accepted as a wording fault** | The rule meant 200 in total. It now says "100 by a scripted player and 100 by random input". The tests were not changed. |
| W3 | The R-B8 test reads the page's own list of played sounds, which is a self-report. | **Accepted** | The test now also counts, from outside the game code, every oscillator the browser is told to start, and requires that count to match and to stand still while muted. |
| W4 | The R-B11 test fakes the "tab is hidden" signal. | **Rejected as a fix, accepted as a limit** | Headless Chromium has no tab to hide, so there is nothing better to run here. The fake stays; the README lists "a really hidden tab pauses the game" as not proven (NP-7). |
| W5 | The R-B7 list of banned strings did not cover leaving the page (`window.open`, `location.assign`, ...). The reviewer grepped the built page and found none. | **Accepted** | The list now also bans `window.open`, `location.assign`, `location.replace`, `location.href`, `.submit(`, `<form`, `<iframe`, `serviceWorker`, `new Worker`, `new Image`, `RTCPeerConnection`. |
| W6 | The R-B9 test measured the bar only at score 0. | **Accepted** | Same change as finding 4. |

## What the reviewer tried to break and could not (its own probes, its own words shortened)

- Replay equals live play: 3000 random games, each replayed from its encoded turn log: `fuzz games 3000 mismatches 0
  longest 361`.
- Hostile turn logs: huge ticks, trailing dots, lower-case directions are rejected; a 200000-entry log (1.15 MB)
  decodes and replays in 94 ms.
- Seed parsing: a one-million-digit seed takes 128 ms; `4294967296` wraps to 0; `1e3`, ` 1`, `-1` are hashed, not
  read as numbers.
- Odd addresses in the real page: a 5000-digit seed, a 150 kB replay string, a replay with seed `abc`, `%00%ff` as
  seed: all load with no console error.
- Rotation 390×844 to 844×390 and back, and a desktop window shrunk to 500×300: the canvas stays inside the window.
- Reading `game.js`: tail-cell collision, full grid, spore order and dew placement "look correct". That part is
  reading, not a probe.

## Found by the builder's own checks, not by the reviewer

For completeness, since the numbers in the README count them separately:

- **3 visible defects found by looking at screenshots** before v2 was tagged, which no test had caught: the pixel
  "W" read as "H", the start panel covered the grub, the bar wrapped on a phone at game over. The 3-wide "W" still
  read as "H" after a first fix and became a 5-wide glyph in v4.
- **2 holes in the unit tests found by deliberate logic faults** (`evidence/v3/mutation-before.txt`, 25 of 27
  caught): a state hash that ignored the score, and dew that could land on the spore, both went unnoticed. Three
  tests were added.
- **1 hole in the browser tests found by deliberate page faults** (`evidence/v4/page-mutation-first-run.txt`): a
  replay that could be steered still passed. The test now presses all four directions during the replay and
  compares the turn log. Note on that file: the browser tests were being edited while that run was in progress, so
  its "caught" lines for R-B9 are not clean; the clean run is the one inside `evidence/v4/check-output.txt`.

## What this review does not prove

One reviewer, one pass, about 3.5 minutes, same model family as the builder. It found page-wiring defects and no
logic defect. That is evidence that the obvious ones are gone, not that none are left.
