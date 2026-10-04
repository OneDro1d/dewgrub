"""Browser tests, part 2: touch, replay, sound, fit, pause, and the originality rules a machine can check.

Test names carry the requirement id (docs/REQUIREMENTS.md): test_R_B3_... proves R-B3.
"""
import subprocess
import time
import unittest

from harness import BrowserCase, DIST, KEY, PHONE, ROOT

SWIPE = {"U": (0, -60), "D": (0, 60), "L": (-60, 0), "R": (60, 0)}


class Finger:
    """Real touch events, sent through the browser's own input pipeline (not synthetic DOM events)."""

    def __init__(self, page):
        self.page = page
        self.cdp = page.context.new_cdp_session(page)

    def _send(self, kind, points):
        self.cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": points})

    def tap(self, x=195, y=700):
        self._send("touchStart", [{"x": x, "y": y}])
        self._send("touchEnd", [])

    def swipe(self, d, x=195, y=700):
        dx, dy = SWIPE[d]
        self._send("touchStart", [{"x": x, "y": y}])
        for i in (1, 2, 3):
            self._send("touchMove", [{"x": x + dx * i / 3, "y": y + dy * i / 3}])
        self._send("touchEnd", [])


class PlayTests(BrowserCase):
    def play_realtime(self, page, press, target_score, timeout=90):
        """Real clock: the scripted player steers until target_score, then lets go and the grub hits a wall."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            s = page.evaluate("""() => {
                const s = window.__dewgrub.state();
                return { status: s.status, score: s.score, dir: s.dir, waiting: s.queue.length,
                         want: s.status === 'playing' ? chooseDir(s) : null };
            }""")
            if s["status"] == "over":
                return
            if s["score"] < target_score and s["waiting"] == 0 and s["want"] != s["dir"]:
                press(s["want"])
            page.wait_for_timeout(10)
        self.fail("the real-time game did not end in time")

    def test_R_B3_touch_tap_starts_swipes_steer_tap_restarts(self):
        page = self.open("seed=123&clock=manual", **PHONE)
        finger = Finger(page)
        self.assertEqual(self.state(page)["status"], "ready")
        finger.tap()
        self.assertEqual(self.state(page)["status"], "playing")
        for d in ["U", "L", "D", "R", "U"]:
            finger.swipe(d)
            self.assertEqual(self.step(page, 1)["dir"], d, f"swipe {d}")
        self.step(page, 30)
        s = self.state(page)
        self.assertEqual((s["status"], s["cause"]), ("over", "wall"))
        page.wait_for_timeout(450)
        finger.swipe("L")  # a swipe is not a tap: it must not restart
        self.assertEqual(self.state(page)["status"], "over")
        finger.tap()
        s = self.state(page)
        self.assertEqual((s["status"], s["score"], s["tick"]), ("playing", 0, 0))

    def test_R_B3_one_long_swipe_can_steer_twice(self):
        page = self.open("seed=123&clock=manual", **PHONE)
        finger = Finger(page)
        finger.tap()
        finger._send("touchStart", [{"x": 200, "y": 600}])
        finger._send("touchMove", [{"x": 200, "y": 560}])   # up
        finger._send("touchMove", [{"x": 160, "y": 560}])   # then left, same finger
        finger._send("touchEnd", [])
        self.assertEqual(self.state(page)["queue"], ["U", "L"])

    def test_R_B3_touch_plays_a_whole_real_time_game(self):
        page = self.open("seed=321", **PHONE)
        finger = Finger(page)
        finger.tap()
        self.play_realtime(page, finger.swipe, target_score=20)
        s = self.state(page)
        self.assertEqual(s["status"], "over")
        self.assertGreaterEqual(len(s["log"]), 2, "the swipes should have steered")
        self.assertIn("GAME OVER", page.evaluate("() => window.__dewgrub.drawn()"))

    def test_R_B6_real_time_run_replays_to_the_same_result(self):
        page = self.open("seed=2026")
        page.keyboard.press("Space")
        self.play_realtime(page, lambda d: page.keyboard.press(KEY[d]), target_score=30)
        s = self.state(page)
        self.assertEqual(s["status"], "over")
        self.assertGreaterEqual(len(s["log"]), 3, "the keys should have steered")

        # 1. Node, no browser, same logic module: (seed, turn log) gives the same hash and score.
        node = subprocess.run(
            ["node", str(ROOT / "tools" / "replay-check.mjs"), str(s["seed"]), s["logText"], s["hash"], str(s["score"])],
            capture_output=True, text=True)
        self.assertEqual(node.returncode, 0, node.stdout + node.stderr)
        self.assertIn("MATCH", node.stdout)

        # 2. The link the page offers plays the run back, on its own, to the same hash.
        self.assertTrue(page.is_visible("#replay"))
        href = page.get_attribute("#replay", "href")
        self.assertEqual(href, f"?seed=2026&replay={s['logText']}")
        again = self.open(href[1:])
        self.assertTrue(self.state(again)["replaying"])
        again.keyboard.press("ArrowUp")  # steering a replay does nothing
        self.wait_status(again, "over", timeout=90000)
        r = self.state(again)
        self.assertEqual((r["hash"], r["score"], r["tick"]), (s["hash"], s["score"], s["tick"]))
        self.assertFalse(r["replaying"])

        # 3. After the replay, Space starts a normal game with the same seed.
        again.wait_for_timeout(450)
        again.keyboard.press("Space")
        n = self.state(again)
        self.assertEqual((n["status"], n["replaying"], n["seed"], n["score"]), ("playing", False, 2026, 0))

    def test_R_B6_a_broken_replay_link_falls_back_to_a_normal_game(self):
        page = self.open("seed=5&replay=not-a-log&clock=manual")
        s = self.state(page)
        self.assertEqual((s["status"], s["replaying"]), ("ready", False))

    def test_R_B8_sound_is_scheduled_on_eat_and_not_when_muted(self):
        page = self.open("seed=123&clock=manual")
        self.assertEqual(page.evaluate("() => window.__dewgrub.sounds().context"), "none")
        page.keyboard.press("Space")
        self.bot_manual(page, lambda s: s["score"] >= 10)
        page.wait_for_function("() => window.__dewgrub.sounds().context === 'running'")
        names = [p["name"] for p in page.evaluate("() => window.__dewgrub.sounds().played")]
        self.assertEqual(names[0], "start")
        self.assertEqual(names.count("eat"), 1)

        page.keyboard.press("m")
        self.assertTrue(self.state(page)["muted"])
        self.assertEqual(page.inner_text("#mute"), "Sound: off")
        self.bot_manual(page, lambda s: s["score"] >= 30)
        self.assertGreaterEqual(self.state(page)["score"], 30)
        muted_names = [p["name"] for p in page.evaluate("() => window.__dewgrub.sounds().played")]
        self.assertEqual(muted_names, names, "nothing may be scheduled while muted")

        page.click("#mute")
        self.assertFalse(self.state(page)["muted"])
        self.assertEqual(self.state(page)["status"], "playing", "a click on the sound button is not a game input")
        self.bot_manual(page, lambda s: s["score"] >= 40)
        after = [p["name"] for p in page.evaluate("() => window.__dewgrub.sounds().played")]
        self.assertEqual(after.count("eat"), 2)

    def test_R_B9_fits_phone_viewports_without_scrolling(self):
        for width, height in [(390, 844), (360, 640), (844, 390), (320, 568)]:
            page = self.open("seed=123&clock=manual", viewport={"width": width, "height": height},
                             has_touch=True, is_mobile=True, device_scale_factor=2)
            page.keyboard.press("ArrowUp")
            self.step(page, 30)  # game over: the bar now shows all three of its items
            self.assertEqual(self.state(page)["status"], "over")
            box = page.evaluate("""() => {
                const r = (el) => { const b = el.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; };
                const items = [document.getElementById('board'), ...document.getElementById('bar').children]
                    .filter((el) => !el.hidden);
                const root = document.scrollingElement;
                return { items: items.map(r), w: window.innerWidth, h: window.innerHeight,
                         scrollW: root.scrollWidth, scrollH: root.scrollHeight };
            }""")
            label = f"{width}x{height}"
            self.assertEqual(len(box["items"]), 4, label)
            for left, top, right, bottom in box["items"]:
                self.assertGreaterEqual(left, 0, label)
                self.assertGreaterEqual(top, 0, label)
                self.assertLessEqual(right, box["w"], label)
                self.assertLessEqual(bottom, box["h"], label)
            self.assertLessEqual(box["scrollW"], box["w"], label)
            self.assertLessEqual(box["scrollH"], box["h"], label)
            board = box["items"][0]
            self.assertGreaterEqual(board[2] - board[0], 0.85 * min(width, (height - 44) * 320 / 368), label)

    def test_R_B11_pause_stops_the_clock_and_a_hidden_tab_pauses(self):
        page = self.open("seed=123")  # real clock
        page.keyboard.press("ArrowDown")
        page.keyboard.press("p")
        s = self.state(page)
        self.assertTrue(s["paused"])
        page.wait_for_timeout(600)
        self.assertEqual(self.state(page)["tick"], s["tick"])
        page.wait_for_function("() => window.__dewgrub.drawn().includes('PAUSED')")
        page.keyboard.press("ArrowLeft")  # steering while paused is ignored
        self.assertEqual(self.state(page)["queue"], s["queue"])
        page.keyboard.press("p")
        self.assertFalse(self.state(page)["paused"])
        page.wait_for_function("t => window.__dewgrub.state().tick > t", arg=s["tick"])

        page.evaluate("""() => {
            Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
            document.dispatchEvent(new Event('visibilitychange'));
        }""")
        s = self.state(page)
        self.assertEqual((s["status"], s["paused"]), ("playing", True))
        page.wait_for_timeout(400)
        self.assertEqual(self.state(page)["tick"], s["tick"])
        page.keyboard.press("Space")  # Space resumes
        self.assertFalse(self.state(page)["paused"])

    def test_R_B12_originality_rules_a_machine_can_check(self):
        html = (DIST / "index.html").read_text().lower()
        title = (ROOT / "README.md").read_text().splitlines()[0].lower()
        for name in ["tetris", "pac-man", "pacman", "breakout", "asteroids", "arkanoid", "nokia"]:
            self.assertNotIn(name, html, f"the page contains {name}")
            self.assertNotIn(name, title, f"the README title contains {name}")
        files = subprocess.run(["git", "-C", str(ROOT), "ls-files"], capture_output=True, text=True, check=True)
        names = files.stdout.split()
        self.assertGreater(len(names), 10)
        asset = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp", ".avif", ".mp3", ".wav", ".ogg",
                 ".flac", ".m4a", ".mp4", ".webm", ".ttf", ".otf", ".woff", ".woff2", ".eot")
        self.assertEqual([n for n in names if n.lower().endswith(asset)], [])
        self.assertNotIn("@font-face", html)
        self.assertNotIn("<img", html)
        self.assertNotIn("<audio", html)
        self.assertNotIn("url(", html)


if __name__ == "__main__":
    unittest.main(verbosity=2)
