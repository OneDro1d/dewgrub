# STACK — what was actually used to build Dewgrub

One line per tool or service, with the evidence that it was used. "Not used" means not used.
Written by the builder (an AI agent) at the end of the build, 4 Oct 2026. Where the only evidence is the agent's
own record, the line says so: that is weaker than a command anyone can re-run.

## Used

| what | version | used for | evidence |
|---|---|---|---|
| Claude Opus 5.5 (model id `claude-opus-5-5`) | — | wrote every file in this repository: requirements, tests, code, docs | The agent's own record: the session's system prompt names the model. Every commit carries `Co-Authored-By: Claude Opus 5.5` (`git log --format=%B`), which the agent also wrote itself. No independent log is in this repo. |
| Claude Code (Anthropic's CLI) | 2.1.289 | the harness the model ran in: file edits, shell, sub-agent | `claude --version` printed `2.1.289 (Claude Code)` on the build machine during the build. |
| Claude Code sub-agent (`Agent` tool, type `general-purpose`) | — | the blind review, once, read-only, against tag `v3` | `evidence/review.md`, and the reviewer's own probe scripts in `evidence/review-probes/`. Which model the sub-agent ran on was not checked. |
| Node.js | v20.20.2 | unit tests (built-in `node:test`), build script, mutation scripts | `node:` line at the top of every `evidence/v*/check-output.txt`. |
| Python + Playwright | Python 3.14, Playwright 1.63.0 | browser tests | `pip list` in the venv `/home/coder/.local/share/smm-venv` printed `playwright 1.63.0`. The venv existed before this build; nothing was installed. |
| Chromium headless shell | Playwright build 1243 | the browser the tests drive | `e2e/harness.py` picks the newest `~/.cache/ms-playwright/chromium_headless_shell-*`; on the build machine that is `-1243`. |
| git | 2.55.0 | local history and tags `v1`..`v4` | `git log`, `git tag`. Local only: the repository has no remote (`git remote -v` prints nothing). |
| OneDroid Synapse hub (the `onedroid` MCP hub) | — | carried the Engram searches below; no other hub tool was called | The searches returned results tagged `groups_searched: [engram-prod]`. The agent's own record; the hub keeps its own audit log, which was not read. |
| OneDroid Engram (memory), **read only** | — | 10 searches up to tag v4 (`engram_search`), required by a hook on the build machine before file edits | Returned document ids, for example `48a56d04-875b-41d1-82a0-2095d9332a54` and `8b7b2fe5-9e11-496d-b708-ca0d158c7d24`. **What it changed in this build:** those two notes ("a suite that has only ever been seen passing has not been shown to check anything"; "run every new test against the previous tree first") are why `tools/mutate-page.mjs` exists and why the review tests were run against the unfixed page first. No search result supplied code, design or requirements for the game. |
| Web search (Claude Code `WebSearch`) | — | 3 searches, to check the name | `DECISIONS.md` D2: "Mosswyrm" was taken, "Dewgrub" had no hit. |
| nuntius message bus | — | one message to the operator (Michal) at the end of the build, saying S2 is ready to be checked. Nothing else was sent to anyone. | The agent's own record. |

## Not used

| what | status |
|---|---|
| OneDroid Engram **write** | Not used. Nothing was written to memory (the brief forbids changes outside this repo and the notepad). |
| Dark Factory skills (`vinculum-loop`, `dark-factory-build`, `df-*`) | Not loaded. The method followed is the seven steps written in the brief: requirements first, logic apart from rendering, a scripted player in a headless browser, evidence per version, a blind review, README, this file. |
| Any other Synapse hub tool (Jira, Confluence, Monday, Slack, Google, Supabase, social posting) | Not used. |
| Any game engine, framework, bundler, npm package | Not used. There is no `package.json` and no `node_modules`. The build is `tools/build.mjs`, 45 lines. |
| Any downloaded asset (image, sound, font) | Not used. A test fails if such a file is committed (R-B12). |
| Any paid service, any deployment, any public repository | Not used. Nothing was pushed or deployed. |
| A real phone, Firefox, Safari | Not used. See "What is proven, and what is not" in the README. |
| A human | No person wrote, reviewed or played anything during the build. |
