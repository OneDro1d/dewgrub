"""Records a gameplay clip of the built page, by script. No person plays, and no sound is recorded
(a headless browser's video has no audio track; the game's sounds are not in the clip).

What the clip shows, in order:
  1. the start panel;
  2. a seeded run by the scripted player (tools/bot.mjs): at least 8 dew and one gold spore, then it stops
     steering and the grub hits a wall;
  3. the game-over panel;
  4. a click on Replay: the page reloads and plays the same run back on its own, with the REPLAY tag.

How the live run is driven: the page is opened with ?clock=manual and this script advances it one tick at a
time, waiting the game's own tick length between ticks, and presses a real key for every turn. That makes the
run exactly the one `node tools/clip-seed.mjs --seed N` computes, on any machine. The replay part runs on the
page's own clock.

Output: .tmp/clip/dewgrub-seed<N>.webm, 1080x1080 (not committed: the repository holds no media file).

Usage, from the repository root:   python3 tools/clip.py [seed]
"""
import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "e2e"))
from harness import KEY, browser_path  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 2194  # found by tools/clip-seed.mjs: 83 ticks, 12 s of play
HOLD_MS = 4000  # how long each panel stays on screen
OUT = ROOT / ".tmp" / "clip"
BOT = (ROOT / "tools" / "bot.mjs").read_text().replace("export function", "window.chooseDir = function")

expected = json.loads(subprocess.run(
    ["node", str(ROOT / "tools" / "clip-seed.mjs"), "--seed", str(SEED)],
    capture_output=True, text=True, check=True).stdout)
if not expected["ok"]:
    sys.exit(f"seed {SEED} does not give 8 dew and a spore: {expected}")

OUT.mkdir(parents=True, exist_ok=True)
with sync_playwright() as pw:
    path = browser_path()
    browser = pw.chromium.launch(headless=True, executable_path=path) if path else pw.chromium.launch()
    size = {"width": 1080, "height": 1080}
    ctx = browser.new_context(viewport=size, record_video_dir=str(OUT), record_video_size=size)
    page = ctx.new_page()
    page.add_init_script(BOT)
    began = time.time()
    page.goto((ROOT / "dist" / "index.html").as_uri() + f"?seed={SEED}&clock=manual")
    page.wait_for_function("() => window.__dewgrub !== undefined")
    page.wait_for_timeout(HOLD_MS)                                   # 1. start panel

    page.keyboard.press("Space")                                     # 2. the live run
    while True:
        t0 = time.time()
        s = page.evaluate("""() => {
            const s = window.__dewgrub.state();
            return { status: s.status, dir: s.dir, dew: s.dewEaten, spores: s.sporesEaten, tickMs: s.tickMs,
                     want: s.status === 'playing' ? chooseDir(s) : null };
        }""")
        if s["status"] != "playing":
            break
        if (s["dew"] < 8 or s["spores"] < 1) and s["want"] != s["dir"]:
            page.keyboard.press(KEY[s["want"]])
        page.evaluate("() => window.__dewgrub.step(1)")
        page.wait_for_timeout(max(0, s["tickMs"] - (time.time() - t0) * 1000))
    live = page.evaluate("() => window.__dewgrub.state()")
    page.wait_for_timeout(HOLD_MS)                                   # 3. game over

    with page.expect_navigation():                                   # 4. the replay
        page.click("#replay")
    page.wait_for_function("() => window.__dewgrub !== undefined")
    page.wait_for_function("() => window.__dewgrub.drawn().includes('REPLAY')")
    page.wait_for_function("() => window.__dewgrub.state().status === 'over'", timeout=120000)
    replayed = page.evaluate("() => window.__dewgrub.state()")
    page.wait_for_timeout(HOLD_MS)
    seconds = time.time() - began
    video = page.video
    ctx.close()  # the video file is complete only once the context is closed
    recorded = Path(video.path())
    browser.close()

target = OUT / f"dewgrub-seed{SEED}.webm"
recorded.replace(target)

problems = []
if live["logText"] != expected["log"] or live["score"] != expected["score"]:
    problems.append(f"the live run is not the computed run: {live['logText']} score {live['score']}")
if live["dewEaten"] < 8 or live["sporesEaten"] < 1:
    problems.append(f"the live run ate {live['dewEaten']} dew and {live['sporesEaten']} spore(s)")
if (replayed["hash"], replayed["score"]) != (live["hash"], live["score"]):
    problems.append("the replay did not end in the same state as the live run")
print(json.dumps({
    "file": str(target.relative_to(ROOT)), "format": "webm, 1080x1080, no audio track", "seed": SEED,
    "seconds_recorded_about": round(seconds, 1), "ticks": live["tick"], "dew": live["dewEaten"],
    "spores": live["sporesEaten"], "score": live["score"], "cause": live["cause"],
    "replay_same_final_state": replayed["hash"] == live["hash"], "problems": problems,
}, indent=2))
sys.exit(1 if problems else 0)
