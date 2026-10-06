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
- A viewer understands it in one glance, which the task asked for.
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

## D10 — Old evidence is regenerated, never edited (4 Oct 2026, v5)

The outputs first stored for v1 to v4 carried folder names of the build machine. To make the repository fit for
strangers they had to go. Editing raw output by hand would make it stop being raw output, so
`tools/regen-evidence.sh` clones each old tag, runs that tag's own checks again and stores the new output. The only
change to the text is made by the script and is stated in every file: the machine's folder names are shown as
`<checkout>`, `<python>` and `<home>`. Rejected: search-and-replace in the stored files (unverifiable), and deleting
the old evidence (it is what the versions table of the README points at).

## D11 — The check finds Python and the browser the standard way (4 Oct 2026, v5)

`./check.sh` uses `python3` and lets Playwright start the Chromium that `playwright install chromium` put in place.
Before v5 it defaulted to a path that existed only on the build machine. `DEWGRUB_PYTHON` and `DEWGRUB_CHROMIUM`
stay as overrides. The proof is `evidence/v5/quickstart-output.txt`: a fresh clone, a fresh virtual environment, an
empty browser cache, three commands.

## D12 — The clip's live run is stepped by the script, not by the page's clock (4 Oct 2026, v5)

`tools/clip.py` opens the page with the test clock and advances it one tick at a time, at the game's own tick
length, pressing a real key for every turn. A scripted player racing the page's real clock would turn a tick late
now and then and record a different run on every machine. Stepped, the recorded run is exactly the run
`tools/clip-seed.mjs` computes, and the script checks that. The replay half of the clip runs on the page's own
clock. Rejected: recording a real-time bot run and accepting whatever it produced.

## D13 — Nothing moves before the first steer (4 Oct 2026, v6)

A first-time player pressing Space and then nothing hit the wall in 1.5 seconds. Now Space or a tap only puts the
start panel away; the grub sets off when a direction is pressed or swiped, and a new game after game over waits the
same way. This is a change of the page only: no rule of the game logic changed, and every replay address made
before still ends in the same state. Rejected: slower first ticks (buys 0.9 s, changes rule R-L9), starting
further from the wall or wrapping walls (both change every seeded run and break every replay address).

## D14 — The service: what "the end of the log" means, and what is an error (4 Oct 2026, v6)

`/api/replay` plays to one tick after the last logged turn, and says `playing` if the grub is still alive there.
The page's replay goes on straight to the wall instead; `"finish": true` asks the service for that, so both
readings are available and neither is a guess. A turn the game does not accept (a reversal, a repeat) is skipped,
as the page skips it, and is not an error: an error would make the service stricter than the game it describes.
A seed outside 0 to 4294967295 is an error, although the page wraps it: an API should not quietly change a number
it was given. Limits (100000 ticks, 65536 bytes) are in `docs/API.md` and a test fails if the doc loses them.

## D15 — The Jev player is proven against a fake, and says so everywhere (4 Oct 2026, v6)

There was no key, and looking for one was forbidden. So the player, its retries, its budget and its handling of
the key are tested against a fake server written from the model's public API description. That proves the player
does what it was designed to do; it does not prove the design matches the real service. The README, STACK.md and
the requirements (NP-10) say so, and the benchmark prints no number for Jev without a real run. The model is asked
for a move relative to the heading (left, straight, right), so no answer can be a reversal. Everything that talks
to the model is one function in `tools/jev-transport.mjs`, so another way of reaching the model is one module to
swap. In the benchmark every player gets the same seeds and the same cap in ticks, so the cap cannot favour one.

## D16 — The author of every commit was rewritten, once (4 Oct 2026, v6)

The history was made on a machine whose git identity was a person's name and work address. Before the repository
can be public that had to go. `tools/rewrite-authors.sh` set author and committer of every commit to a role name
with a no-reply address, kept every date and message, moved the tags, and dropped the old commits from the local
repository. Every commit id changed, so it was done once, after the last code of v6, and the evidence that quotes
ids was regenerated afterwards. A test (R-B16) now fails if any commit carries another identity. Rejected:
publishing one fresh commit with no history (it would lose the commit times that make "one sitting" checkable).

## D17 — No error grows with the input (4 Oct 2026, v7)

The first run of somebody else's scenarios against the v6 service found that a 65536-byte body with a garbage turn
log got a 65611-byte error: the message repeated the whole rejected entry. Rule R-S10: an error body is at most 512
bytes, and a value from the request is shown up to 40 characters, then `…`. Looking at every error path, not only
that one, found two more of the same kind: the 405 message repeated the path (a long path with an encoded slash
that resolves to the page), and the log line carried the whole path, up to the 16 kB Node allows. All three are
cut the same way. The game logic's error now carries the rejected entry as a field (`entry`), so the service shows
that entry and does not have to take a message apart; the logic's rules did not change. A last guard at the one
place every error leaves the service replaces any body over 512 bytes with a fixed message: the cut is the rule,
the guard is for a message somebody adds later. Rejected: cutting the whole message at 512 bytes (it could cut
through the JSON or leave half a sentence), and leaving the value out (the caller then has to guess which entry).

## D18 — On `/api/step`, `finish` is checked and then ignored (6 Oct 2026, v8)

Somebody else's harness ran its checks against v7; 2 failed (of 29 in a first run, of 30 in the run that counts). The builder of v8 was given their names and the rules
they are about, not what they contain. The first is about R-S3, what `/api/step` answers. Reading the rule and
`docs/API.md` against the code found one disagreement: the service read `finish` on both endpoints, so
`{"seed":123,"log":"0D","ticks":3,"finish":true}` played on to the wall and answered `"ticks":10`, where the rule
and the document both say "exactly `ticks` ticks" and the document lists no `finish` for this endpoint. The code
was wrong, not the document. Now `/api/step` checks `finish` as before (a wrong value is still `bad_finish`, as
the documented order of checks says) and never plays a tick more for it. Rejected: refusing `finish` on
`/api/step` with an error (the documented order of checks treats it as a field of every body, and a caller that
sends it gets what it asked for in `ticks`). **Not known:** whether this is what the failed check looks for.

## D19 — The request head: read up to 131072 bytes, refused as JSON beyond (6 Oct 2026, v8)

The second failed check is about R-S4, R-S5 and R-S10 and has "long request line" in its name. Found: a request
whose line and headers pass Node's default limit (about 16 kB) never reached the service's code. Node answered
`431 Request Header Fields Too Large` itself, with no body, no `X-Request-Id` and no log line. Measured at v7: a
path of 16300 characters answered `404` as JSON, one of 16400 the empty `431`. A line that is not HTTP got an
empty `400` the same way. The document says everything else is 404, every error is JSON, every response has a
request id and every request a log line, and it names no 431. Two changes:

- The limit on the head is now 131072 bytes, twice the body limit, so a request line as long as the largest body
  is read and answered by its path like a short one: 404, 405, or the answer of the endpoint. No new code for
  that.
- Above that limit, and for a head that is not HTTP, the service answers itself: status 400, the JSON error body
  with the new codes `head_too_large` and `bad_request`, a new request id, a log line with `null` for method and
  path (neither was read), then it goes on reading what is still arriving for up to 2 seconds, so the caller is
  not cut off while sending, and closes.

Why 400 and not 431: R-S4 says every malformed request gets 400, and the body limit already answers 400
`body_too_large`. Rejected: 431 with a JSON body (a status the rules do not name); 404 `not_found` (wrong when
the long part is a query on a known path, or a header); keeping the 16 kB limit and only making the refusal JSON
(a long path would then never get the 404 the document promises). The rules did not say which of these is right.
The builder put the four to the session that gave the task and proposed this one. That session chose it, from
the rules and the measurements only, and said it does not know what the failed check expects either. Its
conditions: the 512-byte cap holds for the new codes, both sides of the boundary are stated and tested (a count
of 131071 is read, 131072 is refused; what is counted is in `docs/API.md`), each new path has a deliberate
fault, and the body limit does not move. **Not known:** whether this is what the failed check expects.

## D20 — A version must be true about itself at its own tag (6 Oct 2026, v8)

Two things somebody else saw at tag `v7`: the page reported `v6` (the constant was not raised for v7), and the
README pointed at `evidence/v7/`, which was committed on `main` after the tag. Rule R-R1: the version the page
reports is the README's newest version and the tag of the commit. Rule R-R2: every path the README names is in
the commit. Both are browser-suite tests, so `./check.sh` on a fresh clone of a tag fails if either is broken.

The second rule meets a real limit: the output of the full check on a fresh clone of a tag cannot be inside the
commit the tag points at. So the order is now fixed. The commit that gets the tag holds its own red runs
(`tools/red-proof.sh` takes the new tests from the commit before it), and the README at the tag points at those
only. The check output of the tag is committed on `main` straight after, and the README says that this is where
it is. Rejected: moving the tag after the evidence commit (the evidence would then describe another commit than
the one it is stored in), and exempting `evidence/` from R-R2 (that is the fault the rule is for).

## D21 — Before the repository is public: one exception in a test, and claims cut down to what is checked (6 Oct 2026, after v8)

A commit on `main` after tag `v8`, with no code change and no new tag.

**A test was narrowed, on purpose.** The test of R-B16 forbids, in every tracked file, the spelling of the
organisation that hosts this repository, because during the build that spelling was a folder name of the build
machine. The public address of the game contains it. The pattern now allows the spelling directly in front of
`.github.io/dewgrub/` and nowhere else, and the test checks both sides: the address passes, and the same name in
three other places does not. Rejected: leaving the address out of the README (a public game with no address),
and dropping the pattern (it still catches the folder name).

**Claims were cut down to what the test reads.** The README said that no tracked file and no commit carries a
machine path, a person's name or an internal name. The test reads the files of the commit that is checked out,
and the author, committer and message of every commit. It does not read the files of older commits, and the
files at tags `v1` to `v4` are not clean (the counts are in the README). The README now says exactly that. The
history was not rewritten: the ids of the commits that were tested must not change. The rule text of R-B16
already said only what the test reads.

**What the builder was told is written as told.** The outside harness passed tag `v8`, 30 of 30. Another session
called the real Jev model with its own key, without an error. Neither can be shown from this repository, so the
README, `STACK.md` and the requirements say "as told to the builder" and both stay under "not proven".
