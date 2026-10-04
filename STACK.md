# STACK — what was actually used to build Dewgrub

One line per tool or service, with the evidence that it was used. "Not used" means not used.
Written by the builder (an AI agent) on 4 Oct 2026, at the end of v4 and again at v5. Where the only evidence is
the agent's own record, the line says so: that is weaker than a command anyone can re-run.

## Used

| what | version | used for | evidence |
|---|---|---|---|
| Claude Opus 5.5 (model id `claude-opus-5-5`) | — | wrote every file in this repository: requirements, tests, code, docs | The agent's own record: the session's system prompt names the model. Every commit carries `Co-Authored-By: Claude Opus 5.5` (`git log --format=%B`), which the agent also wrote itself. No independent log is in this repo. |
| Claude Code (Anthropic's CLI) | 2.1.289 | the harness the model ran in: file edits, shell, sub-agent | `claude --version` printed `2.1.289 (Claude Code)` on the build machine during the build. The agent's own record. |
| Claude Code sub-agent (`Agent` tool, type `general-purpose`) | — | the blind review, once, read-only, against tag `v3` | `evidence/review.md`, and the reviewer's own probe scripts in `evidence/review-probes/`. Which model the sub-agent ran on was not checked. |
| Node.js | v20.20.2 | unit tests (built-in `node:test`), build script, mutation scripts | `node:` line at the top of every `evidence/v*/check-output.txt`. |
| Python + Playwright | Python 3.14, Playwright 1.63.0 | browser tests, screenshots, the gameplay clip | During the build: a virtual environment that already existed on the build machine (`pip list` printed `playwright 1.63.0`); the agent's own record. Independently: `evidence/v5/quickstart-output.txt` shows `pip install playwright` and the full check in a fresh virtual environment, with the version pip installed that day. |
| Chromium (headless shell) | the build Playwright installs | the browser the tests drive | `evidence/v5/quickstart-output.txt` shows `playwright install chromium` downloading it and the browser tests passing on it. |
| git | 2.55.0 | local history and tags `v1`..`v5` | `git log`, `git tag`. When this was written the repository had no remote and nothing had been pushed. |
| OneDroid Synapse (tool gateway) | — | carried the Engram searches below; no other tool of the gateway was called | The agent's own record. The gateway keeps its own audit log, which the agent did not read. |
| OneDroid Engram (memory), **read only** | — | 11 searches: 10 up to tag v4, 1 at the start of v5 (which returned nothing). A rule on the build machine asks for a memory search before file edits. | Returned document ids, for example `48a56d04-875b-41d1-82a0-2095d9332a54` and `8b7b2fe5-9e11-496d-b708-ca0d158c7d24` (internal ids; a stranger cannot look them up). **What it changed in this build:** those two notes ("a suite that has only ever been seen passing has not been shown to check anything"; "run every new test against the previous tree first") are why `tools/mutate-page.mjs` exists and why new tests are run against the unfixed tree first. No search result supplied code, design or requirements for the game. |
| Web search (Claude Code `WebSearch`) | — | 3 searches, to check the name | `DECISIONS.md` D2: "Mosswyrm" was taken, "Dewgrub" had no hit. |
| A message bus to the operator | — | 2 messages to the human operator, one at the end of v4 and one at the end of v5, each saying the work is ready to be checked. Nothing else was sent to anyone. | The agent's own record. |
| A second AI agent session, as acceptance checker | — | after v4 it cloned the repository, ran `./check.sh` and its own browser scripts, and wrote down what v5 had to be | Its written result, which is not in this repository. The builder did not see its scripts and cannot vouch for them. |

## Not used

| what | status |
|---|---|
| OneDroid Engram **write** | Not used. Nothing was written to memory: the task forbade changes outside this repository and the builder's working notes. |
| The Dark Factory skill pack (the packaged workflow skills) | Not loaded. The method followed is the seven steps written in the task: requirements first, logic apart from rendering, a scripted player in a headless browser, evidence per version, a blind review, README, this file. |
| Any other tool of the Synapse gateway (trackers, wikis, chat, documents, databases, social posting) | Not used. |
| Any game engine, framework, bundler, npm package | Not used. There is no `package.json` and no `node_modules`. The build is `tools/build.mjs`, 45 lines. |
| Any downloaded asset (image, sound, font) | Not used. A test fails if such a file is committed (R-B12). |
| Any paid service, any deployment | Not used. The builder pushed nothing and deployed nothing. Publishing is somebody else's step, after the build. |
| A real phone, Firefox, Safari | Not used. See "What is proven, and what is not" in the README. |
| A human | No person wrote, reviewed or played anything during the build. |
