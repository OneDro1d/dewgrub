"""Takes screenshots of the built game for a human to look at. They go to .tmp/shots/ (not committed:
the repository holds no image file). Usage, from the repository root:

    python3 tools/shots.py        (a Python with Playwright; DEWGRUB_CHROMIUM picks another browser)
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "e2e"))
from harness import PHONE, KEY, browser_path  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

OUT = ROOT / ".tmp" / "shots"
OUT.mkdir(parents=True, exist_ok=True)
URL = (ROOT / "dist" / "index.html").as_uri()
BOT = (ROOT / "tools" / "bot.mjs").read_text().replace("export function", "window.chooseDir = function")


def bot(page, done, limit=3000):
    for _ in range(limit):
        s = page.evaluate("() => { const s = window.__dewgrub.state(); return { st: s.status, score: s.score,"
                          " spore: !!s.spore, dir: s.dir, want: chooseDir(s) }; }")
        if s["st"] != "playing" or done(s):
            return
        if s["want"] != s["dir"]:
            page.keyboard.press(KEY[s["want"]])
        page.evaluate("() => window.__dewgrub.step(1)")


with sync_playwright() as pw:
    path = browser_path()
    browser = pw.chromium.launch(headless=True, executable_path=path) if path else pw.chromium.launch()
    for name, opts in [("phone", PHONE), ("desktop", dict(viewport={"width": 900, "height": 760}))]:
        page = browser.new_context(**opts).new_page()
        page.add_init_script(BOT)
        page.goto(URL + "?seed=123&clock=manual")
        page.wait_for_timeout(200)
        page.screenshot(path=OUT / f"{name}-1-ready.png")
        page.keyboard.press("Space")
        bot(page, lambda s: s["spore"])
        page.wait_for_timeout(100)
        page.screenshot(path=OUT / f"{name}-2-spore.png")
        bot(page, lambda s: s["score"] >= 300)
        page.wait_for_timeout(100)
        page.screenshot(path=OUT / f"{name}-3-long.png")
        bot(page, lambda s: False)
        page.wait_for_timeout(100)
        page.screenshot(path=OUT / f"{name}-4-over.png")
        print(name, page.evaluate("() => window.__dewgrub.state().score"))
    browser.close()
print("wrote", OUT)
