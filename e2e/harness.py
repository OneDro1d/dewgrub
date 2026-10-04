"""Shared setup for the browser tests: serve dist/ on localhost, open headless Chromium, watch every page.

Every test, whatever it is about, also fails if the page logs an error or warning, throws, or makes any
request other than loading itself (see tearDown).
"""
import functools
import glob
import http.server
import os
import re
import threading
import unittest
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
# DEWGRUB_DIST points the tests at another build (tools/mutate-page.mjs uses it for deliberately broken pages).
DIST = Path(os.environ.get("DEWGRUB_DIST") or ROOT / "dist")
KEY = {"U": "ArrowUp", "D": "ArrowDown", "L": "ArrowLeft", "R": "ArrowRight"}
PHONE = dict(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True, device_scale_factor=3)


def browser_path():
    """DEWGRUB_CHROMIUM if set, else the newest headless shell Playwright has installed, else Playwright's default."""
    if os.environ.get("DEWGRUB_CHROMIUM"):
        return os.environ["DEWGRUB_CHROMIUM"]
    found = glob.glob(os.path.expanduser(
        "~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell"))
    if not found:
        return None
    return max(found, key=lambda p: int(re.search(r"shell-(\d+)", p).group(1)))


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class BrowserCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        handler = functools.partial(QuietHandler, directory=str(DIST))
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}/index.html"
        cls.pw = sync_playwright().start()
        path = browser_path()
        cls.browser = cls.pw.chromium.launch(headless=True, executable_path=path) if path else cls.pw.chromium.launch()
        # The scripted player, loaded into every page as a plain global function.
        cls.bot_js = (ROOT / "tools" / "bot.mjs").read_text().replace("export function", "window.chooseDir = function")

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        self.contexts = []
        self.problems = []
        self.requests = []
        self.loaded = []

    def tearDown(self):
        for ctx in self.contexts:
            ctx.close()
        self.assertEqual(self.problems, [], "the page reported a problem")
        extra = [u for u in self.requests if u not in self.loaded]
        self.assertEqual(extra, [], "the page made a request other than loading itself")

    def open(self, query="", url=None, **context_options):
        """Open the built page in a fresh browser context (no shared state with any other page)."""
        options = context_options or dict(viewport={"width": 900, "height": 760})
        ctx = self.browser.new_context(**options)
        self.contexts.append(ctx)
        page = ctx.new_page()
        page.add_init_script(self.bot_js)
        page.on("console", lambda m: self.problems.append(f"console {m.type}: {m.text}")
                if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: self.problems.append(f"uncaught: {e}"))
        page.on("request", lambda r: self.requests.append(r.url))
        target = url or (self.base + ("?" + query if query else ""))
        self.loaded.append(target)
        page.goto(target)
        page.wait_for_function("() => window.__dewgrub !== undefined")
        return page

    @staticmethod
    def state(page):
        return page.evaluate("window.__dewgrub.state()")

    @staticmethod
    def step(page, n=1):
        """Advance the manual clock by n ticks (only on pages opened with clock=manual)."""
        return page.evaluate("n => window.__dewgrub.step(n)", n)

    def wait_status(self, page, status, timeout=20000):
        page.wait_for_function("s => window.__dewgrub.state().status === s", arg=status, timeout=timeout)

    def bot_manual(self, page, done, max_steps=4000, press=None):
        """Manual clock: the scripted player presses real keys, the test advances the clock one tick at a time.

        Returns the list of (tick, direction) presses and the last state seen.
        """
        press = press or (lambda d: page.keyboard.press(KEY[d]))
        presses = []
        for _ in range(max_steps):
            s = page.evaluate("""(() => {
                const s = window.__dewgrub.state();
                return { status: s.status, score: s.score, dir: s.dir, tick: s.tick, want: chooseDir(s) };
            })()""")
            if s["status"] != "playing" or done(s):
                return presses, s
            if s["want"] != s["dir"]:
                press(s["want"])
                presses.append((s["tick"], s["want"]))
            self.step(page, 1)
        self.fail(f"scripted player did not finish in {max_steps} ticks")
