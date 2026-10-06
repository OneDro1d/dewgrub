# STACK — what was actually used to build Dewgrub

One line per tool or service, with the evidence that it was used. "Not used" means not used.
Written by the builder (an AI agent) on 4 Oct 2026, at the end of v4 and again at v5, v6 and v7. Where the only
evidence is the agent's own record, the line says so: that is weaker than a command anyone can re-run.

**v8 (6 Oct 2026) was built by another session**, on a fresh clone, with none of the first builder's notes: what
it knew of v1 to v7 is what this repository says. Its lines are marked "v8" below. The lines without that mark
are the first builder's record and were not checked again.

## Used

| what | version | used for | evidence |
|---|---|---|---|
| Claude Opus 5.5 (model id `claude-opus-5-5`) | — | wrote every file in this repository: requirements, tests, code, docs | The agent's own record: the session's system prompt names the model. Every commit message ends with `Co-Authored-By: Claude Opus 5.5` (`git log --format=%B`), which the agent also wrote itself. No independent log is in this repo. |
| Claude Code (Anthropic's CLI) | 2.1.289 | the harness the model ran in: file edits, shell, sub-agent | `claude --version` printed `2.1.289 (Claude Code)` on the build machine during the build. The agent's own record. |
| Claude Code sub-agent (`Agent` tool, type `general-purpose`) | — | the blind review, once, read-only, against tag `v3` | `evidence/review.md`, and the reviewer's own probe scripts in `evidence/review-probes/`. Which model the sub-agent ran on was not checked. |
| Node.js | v20.20.2 | unit tests (built-in `node:test`), build script, the local service, the players, mutation scripts | `node:` line at the top of every `evidence/v*/check-output.txt`. |
| Python + Playwright | Python 3.14, Playwright 1.63.0 | browser tests, screenshots, the gameplay clip | During the build: a virtual environment that already existed on the build machine; the agent's own record. Independently: `evidence/v6/quickstart-output.txt` shows `pip install playwright` and the full check in a fresh virtual environment, with the version pip installed that day. |
| Chromium (headless shell) | the build Playwright installs | the browser the tests drive | `evidence/v6/quickstart-output.txt` shows `playwright install chromium` downloading it and the browser tests passing on it. |
| git | 2.55.0 | local history and tags `v1`..`v7`; at the end of v6, `git filter-branch` to rewrite the author of every commit | `git log`, `git tag`, `tools/rewrite-authors.sh`. When this was written the repository had no remote and nothing had been pushed. |
| The Jev model's public API description (docs.typesafe.ai/api) | read 4 Oct 2026 | the request and answer shapes the Jev player and the fake server are written from | The agent's own record. It was read through a web-fetch tool that returns the page as summarised by a small model, not as raw text. The shapes are written out at the top of `tools/jev-transport.mjs`. |
| OneDroid Synapse (tool gateway) | — | carried the Engram searches below; no other tool of the gateway was called | The agent's own record. The gateway keeps its own audit log, which the agent did not read. |
| OneDroid Engram (memory), **read only** | — | 12 searches: 10 up to tag v4, 1 at the start of v5 (which returned nothing), none in v6, 1 in v7 (which returned nothing about this work). A rule on the build machine asks for a memory search before file edits. | Returned document ids, for example `48a56d04-875b-41d1-82a0-2095d9332a54` and `8b7b2fe5-9e11-496d-b708-ca0d158c7d24` (internal ids; a stranger cannot look them up). **What it changed in this build:** those two notes ("a suite that has only ever been seen passing has not been shown to check anything"; "run every new test against the previous tree first") are why `tools/mutate-page.mjs` exists and why new tests are run against the unfixed tree first. No search result supplied code, design or requirements for the game. |
| Web search (Claude Code `WebSearch`) | — | 3 searches, to check the name | `DECISIONS.md` D2: "Mosswyrm" was taken, "Dewgrub" had no hit. |
| A message bus to the operator | — | 4 messages to the human operator, one at the end of each of v4, v5, v6 and v7, each saying the work is ready to be checked (the v5 one also asked what the public history may show). Nothing else was sent to anyone. | The agent's own record. |
| A second AI agent session, as acceptance checker | — | after v4 and after v5 it cloned the repository, ran `./check.sh` and its own scripts, and wrote down what the next version had to be; after v6 it ran 16 scenarios of its own against the service and reported one defect (an error body that repeated the input), which v7 fixes; it holds the independent test for the service | Its written results, which are not in this repository. The builder did not see its scripts or its test and cannot vouch for them. |
| v8: Claude Opus 5.5 (model id `claude-opus-5-5`) in Claude Code 2.1.291 | — | wrote every change of v8: tests, code, documents | The agent's own record: the session's system prompt names the model, and `claude --version` printed `2.1.291 (Claude Code)`. |
| v8: Node.js v20.20.2, git 2.55.0, Python 3 with Playwright and its Chromium | — | the same uses as above | `node:` line in the v8 evidence files. Playwright was installed for v8 with `pip install playwright` and `playwright install chromium` in a new virtual environment; that install is not recorded in this repository. Unlike v1 to v7, v8 was made on a clone of a private remote repository and pushed back to it; nothing was made public and nothing was deployed. |
| v8: a message bus to a second AI agent session | — | The task for v8 came over it: the names of two failed checks and the rules they are about, two observations, and what to deliver. The builder sent back one question (which status a request head over the limit should get; see `DECISIONS.md` D19) and the result. | The agent's own record. |
| v8: OneDroid Engram (memory), **read only** | — | A rule on the build machine asks for a memory search before file edits. The searches returned nothing about this game. Two returned the note already named above ("a suite that has only ever been seen passing has not been shown to check anything"), which is why the new tests of v8 were run on a fresh clone of tag `v7` first. No result supplied code or design. | The agent's own record. |

## Not used

| what | status |
|---|---|
| **The real Jev model (TypeSafe's API)** | **Never called.** The builder had no key and did not look for one. `tools/jev-player.mjs` and `tools/bench.mjs` were run only against a fake server that the tests start on the local machine. There is no Jev result of any kind in this repository. |
| OneDroid Argus (the independent test harness) | Not used by the builder. The service in `tools/serve.mjs` was made so that somebody else can test it with their own harness; that test and its results are not here. v8: somebody else ran it against tag `v7` (29 checks, 2 failed); the builder of v8 did not run it, did not see its checks, and has no way to reach the session that holds them. |
| OneDroid Engram **write** | Not used. Nothing was written to memory: the task forbade changes outside this repository and the builder's working notes. |
| The Dark Factory skill pack (the packaged workflow skills) | Not loaded, in any version. The method followed is the seven steps written in the first task: requirements first, logic apart from rendering, a scripted player in a headless browser, evidence per version, a blind review, README, this file. |
| Any other tool of the Synapse gateway (trackers, wikis, chat, documents, databases, social posting) | Not used. |
| Any game engine, framework, bundler, npm package | Not used. There is no `package.json` and no `node_modules`. The build is `tools/build.mjs`, 45 lines. The service and the players use Node's built-in modules only. |
| Any downloaded asset (image, sound, font) | Not used. A test fails if such a file is committed (R-B12). |
| Any paid service, any deployment | Not used. The builder pushed nothing and deployed nothing. Publishing is somebody else's step, after the build. |
| A real phone, Firefox, Safari | Not used. See "What is proven, and what is not" in the README. |
| A human | No person wrote, reviewed or played anything during the build. A person chose what to build. The two decisions of v6 (the first-steer start, the neutral author) reached the builder from the second agent session, which wrote that it had told the operator. |
