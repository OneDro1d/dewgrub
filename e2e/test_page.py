"""Browser tests, part 1: the page loads, the keyboard plays, the score shows, seeds repeat, nothing leaves the page.

Test names carry the requirement id (docs/REQUIREMENTS.md): test_R_B1_... proves R-B1.
"""
import re
import unittest

from harness import BrowserCase, DIST, KEY


class PageTests(BrowserCase):
    def test_R_B1_loads_clean_and_draws(self):
        page = self.open("seed=123")
        self.assertEqual(page.title(), "Dewgrub")
        self.assertEqual(self.state(page)["status"], "ready")
        page.wait_for_function("() => window.__dewgrub.drawn().length > 0")
        # One read of the canvas (Chromium warns in the console about repeated reads, and a warning fails the test).
        px = page.evaluate("""() => {
            const c = document.getElementById('board');
            const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
            const seen = new Set();
            for (let i = 0; i < d.length; i += 4) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
            const k = c.width / 320;
            const s = window.__dewgrub.state();
            const at = (cell) => {
                const x = Math.round((cell.x * 16 + 8) * k);
                const y = Math.round((48 + cell.y * 16 + 8) * k);
                const i = (y * c.width + x) * 4;
                return [d[i], d[i + 1], d[i + 2]];
            };
            return { colours: seen.size, head: at(s.grub[0]), dew: at(s.dew), empty: at({ x: 2, y: 18 }) };
        }""")
        self.assertGreater(px["colours"], 8)
        self.assertIn("DEWGRUB", page.evaluate("() => window.__dewgrub.drawn()"))
        # The board itself is drawn: the pixel at the grub's head is green, at the dew blue, at an empty cell dark.
        r, g, b = px["head"]
        self.assertTrue(g > 180 and g > b + 40, f"head pixel {px['head']}")
        r, g, b = px["dew"]
        self.assertTrue(b > 180 and b > r + 40, f"dew pixel {px['dew']}")
        self.assertLess(sum(px["empty"]), 150, f"empty cell pixel {px['empty']}")
        # tearDown asserts: no console error or warning, no uncaught exception.

    def test_R_B2_keyboard_plays_from_ready_to_over_and_restarts(self):
        page = self.open("seed=123")  # real clock
        self.assertEqual(self.state(page)["status"], "ready")
        # v6: Space only puts the start panel away. Nothing moves until the first steer.
        page.keyboard.press("Space")
        s = self.state(page)
        self.assertEqual((s["status"], s["armed"], s["tick"]), ("ready", True, 0))
        page.wait_for_timeout(500)
        s = self.state(page)
        self.assertEqual((s["status"], s["tick"], s["grub"][0]), ("ready", 0, {"x": 10, "y": 10}))
        page.wait_for_function("() => window.__dewgrub.drawn().includes('STEER TO START')")
        self.assertEqual(page.evaluate("() => window.__dewgrub.drawn()").count("DEWGRUB"), 1)  # the title panel is gone
        page.keyboard.press("ArrowUp")
        self.assertEqual(self.state(page)["status"], "playing")
        self.wait_status(page, "over")
        s = self.state(page)
        self.assertEqual(s["cause"], "wall")
        self.assertEqual(s["grub"][0], {"x": 10, "y": 0})
        self.assertIn("GAME OVER", page.evaluate("() => window.__dewgrub.drawn()"))
        page.wait_for_timeout(450)
        # Space after game over gives a new game, which again waits for the first steer.
        page.keyboard.press("Space")
        s = self.state(page)
        self.assertEqual((s["status"], s["armed"], s["score"], s["tick"]), ("ready", True, 0, 0))
        page.wait_for_timeout(400)
        self.assertEqual(self.state(page)["tick"], 0)
        page.keyboard.press("s")
        self.assertEqual(self.state(page)["status"], "playing")
        page.wait_for_function("() => window.__dewgrub.state().dir === 'D'")

    def test_R_B2_a_steer_starts_the_game_without_space_first(self):
        page = self.open("seed=123&clock=manual")
        page.keyboard.press("ArrowRight")  # the direction the grub already faces: it starts and adds no turn
        s = self.state(page)
        self.assertEqual((s["status"], s["log"]), ("playing", []))
        self.assertEqual(self.step(page, 1)["grub"][0], {"x": 11, "y": 10})

    def test_R_B2_arrow_keys_do_not_restart_a_finished_game(self):
        page = self.open("seed=123&clock=manual")
        page.keyboard.press("ArrowUp")
        self.step(page, 30)
        self.assertEqual(self.state(page)["status"], "over")
        page.wait_for_timeout(450)
        page.keyboard.press("ArrowLeft")
        self.assertEqual(self.state(page)["status"], "over")
        page.keyboard.press("Enter")
        s = self.state(page)
        self.assertEqual((s["status"], s["armed"], s["tick"], s["score"]), ("ready", True, 0, 0))

    def test_R_B4_score_on_the_page_is_the_logic_score(self):
        page = self.open("seed=123&clock=manual")
        page.keyboard.press("ArrowRight")  # the first steer starts the game
        _, s = self.bot_manual(page, lambda s: s["score"] >= 30)
        score = self.state(page)["score"]
        self.assertGreaterEqual(score, 30)
        self.assertEqual(page.inner_text("#score"), f"Score {score}")
        page.wait_for_function("t => window.__dewgrub.drawn().includes(t)", arg=f"SCORE {score}")

    def test_R_B5_same_seed_and_same_keys_give_the_same_run(self):
        a = self.open("seed=123&clock=manual")
        first_dew = self.state(a)["dew"]
        a.keyboard.press("ArrowRight")
        presses, _ = self.bot_manual(a, lambda s: s["tick"] >= 150)
        self.step(a, 60)  # stop steering: the grub runs into a wall
        end_a = self.state(a)
        self.assertEqual(end_a["status"], "over")
        self.assertGreater(len(presses), 5)

        b = self.open("seed=123&clock=manual")
        self.assertEqual(self.state(b)["dew"], first_dew)
        b.keyboard.press("ArrowRight")
        by_tick = {}
        for tick, d in presses:
            by_tick.setdefault(tick, []).append(d)
        while self.state(b)["status"] == "playing":
            for d in by_tick.get(self.state(b)["tick"], []):
                b.keyboard.press(KEY[d])
            self.step(b, 1)
        end_b = self.state(b)
        self.assertEqual(end_b["hash"], end_a["hash"])
        self.assertEqual(end_b["score"], end_a["score"])

        c = self.open("seed=124&clock=manual")
        self.assertNotEqual(self.state(c)["dew"], first_dew)

        # Restart in seeded mode: the same game starts again.
        b.wait_for_timeout(450)
        b.keyboard.press("Space")
        again = self.state(b)
        self.assertEqual((again["seed"], again["tick"], again["score"], again["dew"]), (123, 0, 0, first_dew))

    def test_R_B5_without_a_seed_each_game_gets_its_own_seed(self):
        a = self.open("clock=manual")
        b = self.open("clock=manual")
        self.assertNotEqual(self.state(a)["seed"], self.state(b)["seed"])

    def test_R_B7_no_network(self):
        page = self.open("seed=7&clock=manual")
        page.keyboard.press("ArrowRight")
        self.bot_manual(page, lambda s: s["score"] >= 60)
        self.step(page, 60)
        self.assertEqual(self.state(page)["status"], "over")
        self.assertEqual(len(self.requests), 1, self.requests)  # the page itself, nothing else

        html = (DIST / "index.html").read_text()
        csp = re.search(r'http-equiv="Content-Security-Policy" content="([^"]+)"', html)
        self.assertIsNotNone(csp)
        self.assertIn("default-src 'none'", csp.group(1))
        self.assertNotIn("connect-src", csp.group(1))
        self.assertNotIn("unsafe", csp.group(1))
        for banned in ["http://", "https://", "fetch(", "XMLHttpRequest", "WebSocket", "sendBeacon", "EventSource",
                       "import(", "importScripts", "localStorage", "sessionStorage", "document.cookie", "indexedDB",
                       # Leaving the page is also a request (added after the blind review).
                       "window.open", "location.assign", "location.replace", "location.href", ".submit(", "<form",
                       "<iframe", "serviceWorker", "new Worker", "new Image", "RTCPeerConnection"]:
            self.assertNotIn(banned, html, f"the built page contains {banned}")

    def test_R_B7_the_browser_blocks_a_request_if_one_is_tried(self):
        # Proves the policy has teeth: a request made on purpose from inside the page is refused by the browser.
        page = self.open("seed=7")
        outcome = page.evaluate("""(async () => {
            try { await fetch(location.href); return 'allowed'; } catch (e) { return 'blocked'; }
        })()""")
        self.assertEqual(outcome, "blocked")
        self.problems = [p for p in self.problems if "Content Security Policy" not in p and "Refused to connect" not in p]
        self.requests = [u for u in self.requests if u in self.loaded][:1]

    def test_R_B10_works_opened_from_disk(self):
        page = self.open(url=(DIST / "index.html").as_uri() + "?seed=5")
        self.assertEqual(self.state(page)["status"], "ready")
        page.keyboard.press("ArrowRight")
        self.assertEqual(self.state(page)["status"], "playing")
        self.wait_status(page, "over")


if __name__ == "__main__":
    unittest.main(verbosity=2)
