# Dewgrub

A small arcade game that runs in a browser tab, on a phone too, with nothing to install. You steer a grub to the
dew drops. Each drop makes the grub longer and the game faster. Hit a wall or yourself and the game is over.

The whole game is one file, `dist/index.html` (28 kB). An AI agent wrote it in one sitting, test-first, and every
claim on this page points at output you can re-run. The game is the small part. The evidence is the point.

## Play it

**Public address: (not published yet: this line is filled in when the game goes online)**

Or download this repository and open `dist/index.html` in a browser. That is all.

- Keyboard: arrows or W A S D steer, Space or Enter starts and restarts, P pauses, M mutes.
- Touch: tap to start and restart, swipe to steer.
- Add `?seed=123` to the address to play the same game every time. After a game, **Replay** gives a link that plays
  your run back exactly.

## Check it yourself

Three commands, in this folder, on a machine with Node 20 or newer, git and Python 3:

    pip install playwright
    playwright install chromium
    ./check.sh

The last line must be `ALL CHECKS PASSED`. It takes about 8 minutes; `./check.sh --quick` skips the slowest step and
takes about 2. Use a virtual environment if you do not want Playwright installed for your whole user
(`python3 -m venv .venv`, then `. .venv/bin/activate`, then the three commands).

These three commands were run exactly like that on a fresh clone, in a fresh virtual environment, with an empty
browser cache: `evidence/v5/quickstart-output.txt` (made by `tools/quickstart-proof.sh`). That proof is from one
Linux machine that already had the system libraries Chromium needs. If Chromium does not start on yours, run
`playwright install --with-deps chromium`. `check.sh` is a bash script; Windows without a bash was not tried.

`DEWGRUB_PYTHON` chooses another Python and `DEWGRUB_CHROMIUM` another browser executable.

## What the game is made of

- No engine, no framework, no package, no image, sound or font file. The art is drawn on a canvas in code, the
  letters are a pixel font made here, the sounds are oscillator notes made here.
- No backend, no account, no tracking, no network request while it runs. The page carries a security policy that
  forbids every request, and a test proves the browser enforces it.
- It works opened from disk, and from a sub-path of a web host (`https://<host>/<anything>/`).

## What `./check.sh` runs

| step | what | proves |
|---|---|---|
| 1 | `node --test test/` | the game logic and the browser-free parts of the presentation obey their rules |
| 2 | `node tools/mutate.mjs` | the unit tests bite: the logic is broken on purpose 28 ways, and each time a unit test must fail |
| 3 | `node tools/build.mjs --check` | the committed `dist/index.html` is exactly what the source builds to |
| 4 | Playwright tests in `e2e/` | the built page works in headless Chromium: keyboard, touch, mouse, seed, replay, sound, pause, fit, sub-path, no network; and the repository holds nothing machine-specific |
| 5 | `node tools/mutate-page.mjs` | the browser tests bite: the page is broken on purpose 32 ways, and each time the named browser test must fail |
| 6 | `node tools/trace.mjs` | every rule in `docs/REQUIREMENTS.md` is named by at least one test |

Other commands: `node tools/build.mjs` rebuilds the page. `tools/numbers.sh` prints the numbers below from the
repository. `tools/evidence.sh vN` runs `./check.sh` on a fresh clone and stores the output.
`python3 tools/shots.py` takes screenshots and `python3 tools/clip.py` records a gameplay clip, both into `.tmp/`
(not committed: the repository holds no image or video).

## How it was built

1. **Rules first.** `docs/REQUIREMENTS.md` lists 34 checkable rules and 9 claims that no test here can prove. The
   rules were written before the tests, and the tests before the code. `evidence/v1/red-output.txt` is the test run
   at the first commit, failing because no game code existed yet.
2. **Logic apart from drawing.** `src/game.js` has no browser in it: no clock, no random call, no DOM. Time is
   counted in ticks, so a run is fully described by a seed and a list of turns.
3. **A scripted player.** `tools/bot.mjs` plays real games: in Node for the unit tests, and in headless Chromium
   by pressing real keys and sending real touch events to the built page.
4. **Small versions, each with evidence.** `evidence/vN/check-output.txt` is the raw output of `./check.sh` at tag
   `vN`, with the command that produced it.
5. **Tests that were seen failing.** A test that has only ever passed has not been shown to check anything. So the
   logic and the page are broken on purpose (steps 2 and 5 above), and the tests must notice.
6. **A blind review.** A second agent that saw the code but none of the builder's notes looked for defects. Its
   findings, the ones accepted and the one rejected, are in `evidence/review.md`.

| version | what it added | evidence |
|---|---|---|
| v1 | game logic, seeded, with unit tests | `evidence/v1/` (red run, then green) |
| v2 | the page: canvas art, pixel font, keyboard, seeded mode, one-file build, strict security policy | `evidence/v2/` |
| v3 | touch, replay link, sound, pause, phone fit proven in the browser; deliberate logic faults | `evidence/v3/` (incl. `mutation-before.txt`: 25 of 27 caught, then fixed) |
| v4 | fixes for what the blind review found; deliberate page faults; wider M and W glyphs | `evidence/v4/` (incl. `red-output.txt`: the review tests failing on the v3 page), `evidence/review.md` |
| v5 | made fit for strangers: MIT license, nothing machine-specific in any tracked file, the three-command check, the sub-path test, a scripted gameplay clip. The game itself did not change, apart from its internal version label. | `evidence/v5/` (incl. `red-output.txt`: the new tests failing before the clean-up, and `quickstart-output.txt`) |

**The outputs in `evidence/v1` to `evidence/v4` were regenerated at v5.** The ones first stored carried folder names
of the machine they were made on. Raw output is not edited by hand, so `tools/regen-evidence.sh` cloned each old
tag afresh, ran that tag's own checks again, and stored the new output, with the machine's folder names shown as
`<checkout>`, `<python>` and `<home>`. Each file names its git ref and command in its first lines. The first outputs
are still in git history (`git show v4:evidence/v4/check-output.txt`). One file could not be regenerated and was
kept as it was: `evidence/v4/page-mutation-first-run.txt`, a run made while the tests were being edited.

## The numbers

Printed by `tools/numbers.sh` at tag `v5`, except the last four rows, whose source is named.

| what | number |
|---|---|
| lines of game source (`src/`, with comments and blank lines) | 891 |
| of which game logic (`src/game.js`) | 207 |
| lines of tests (`test/`, `e2e/`) | 1284 |
| lines of tools (`tools/`, `check.sh`) | 798 |
| size of the built page | 28108 bytes |
| unit tests | 37 |
| browser tests | 26 |
| rules in the requirements, each named by a test | 34 |
| deliberate logic faults, all caught | 28 |
| deliberate page faults, all caught | 32 |
| versions | 5 (tags `v1` to `v5`) |
| runtime dependencies | 0 |
| wall-clock time | The game (v1 to v4): 0.7 hours, from the task being opened at 13:29 UTC to tag `v4` at 14:13 UTC on 4 Oct 2026; the first commit is at 13:35 (`git log`). Making it fit for strangers (v5): about half an hour of work to tag `v5` (14:40 to about 15:10 UTC), plus about 40 minutes of checks running on fresh clones before and after the tag. |
| defects the blind review found | 4 confirmed and fixed, 1 accepted in part; none in the game logic (`evidence/review.md`) |
| test weaknesses the blind review found | 6: 4 fixed, 1 was a wording fault in a rule, 1 rejected and listed below as not proven |
| defects the builder's own checks found | 3 by looking at screenshots, 2 holes in the unit tests and 1 in the browser tests by deliberate faults (`evidence/review.md`, last section) |

## What is proven, and what is not

**Proven**, by output anyone can re-run with `./check.sh`:

- The game logic obeys the 15 logic rules (movement, turning, walls, self-collision, dew, spore, speed, game over,
  full grid, turn log, seed parsing), including on every tick of 200 seeded games.
- Same seed and same turns give the same run, tick for tick. A real-time game played in the browser is replayed
  in Node, with no browser, to the same final state; and the replay link plays it back in the browser to the same
  final state.
- In headless Chromium the built page goes from start to game over and restarts, by keyboard, by touch events on
  an emulated phone, and by mouse.
- The score on the page is the score in the logic.
- The page makes no request other than loading itself, and the browser refuses a request made on purpose from
  inside the page (Content-Security-Policy `default-src 'none'`, script and style allowed by hash only).
- Sounds are scheduled on game events (the browser is told to start one oscillator per note) and not while muted.
- The canvas and the bar under it fit 390×844, 360×640, 844×390 and 320×568 without scrolling.
- The built file works opened from disk, and served from a sub-path by a local server that answers nothing else.
- No tracked file contains a home-folder path, the operator's name, or the internal names of the workspace it was
  built in.
- The tests are not decorative: 28 of 28 deliberate logic faults and 32 of 32 deliberate page faults make a test
  fail.

**Not proven:**

- **It is fun.** Nobody played it. Not the builder, not a person.
- **It works on a real phone.** Only an emulated phone viewport with touch events in desktop Chromium was tested.
- **It works in Firefox or Safari.** Only Chromium was tested. iOS Safari in particular is untested, and its rules
  for starting sound are stricter.
- **The sounds are pleasant, or audible at all.** The tests see that notes are scheduled, not what a speaker plays.
  The gameplay clip made by `tools/clip.py` has no sound track.
- **The art looks good.** The tests see that the grub, the dew and the texts are drawn. The builder looked at
  screenshots and fixed three visible faults; that is one look by an AI, not a judgement of taste.
- **The name is free to use.** One web search found no game called Dewgrub. No trademark register was checked.
- **A really hidden tab pauses the game.** The test fakes the browser's "tab is hidden" signal.
- **It is usable with a screen reader.** The board has a label that states the game status; nobody listened to it.
- **The four-digit score fits the bar** was tested with a simulated score text, not by playing to 1000 points.
- **It works at its public address.** The sub-path test runs against a local server. The real host, its headers and
  its caching were not tested, because nothing was deployed when this was written.
- **The three-command check works on your machine.** It was proven on one Linux machine (see above). macOS and
  Windows were not tried.
- **There are no defects left.** One blind review of about 3.5 minutes by one agent of the same model family, and
  60 deliberate faults chosen by the builder. Faults nobody thought of are not covered.
- **Who wrote it.** That an AI agent wrote all of it is the agent's own record (`STACK.md` says which lines of
  evidence are independent and which are not).

## Files

    dist/index.html        the game (built, committed)
    src/                   game.js (logic), main.js (page), render.js, input.js, audio.js, font.js, sounds.js
    test/                  unit tests (Node)
    e2e/                   browser tests (Python, Playwright)
    tools/                 build, scripted player, deliberate faults, replay check, evidence, numbers, clip
    docs/REQUIREMENTS.md   the rules, and the claims that cannot be proven
    DECISIONS.md           what was chosen and why
    STACK.md               the tools actually used, each with its evidence
    evidence/              raw check output per version, the blind review, the reviewer's probes
    LICENSE                MIT

## License

MIT license, copyright 2026 OneDroid. See `LICENSE`.
