"""Browser tests, part 5 (v6): the page and the local service agree.

The service (tools/serve.mjs) is started as a real program on a free port. It serves the built page and the API.
"""
import json
import os
import subprocess
import unittest
import urllib.request

from harness import BrowserCase, DIST, ROOT


class ServiceTests(BrowserCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        env = dict(os.environ, PORT="0", DEWGRUB_DIST=str(DIST))
        cls.service = subprocess.Popen(["node", str(ROOT / "tools" / "serve.mjs")], env=env,
                                       stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        first = json.loads(cls.service.stdout.readline())
        cls.service_url = f"http://127.0.0.1:{first['port']}"

    @classmethod
    def tearDownClass(cls):
        cls.service.terminate()
        cls.service.wait(timeout=10)
        cls.service.stdout.close()
        super().tearDownClass()

    def post(self, path, body):
        req = urllib.request.Request(self.service_url + path, data=json.dumps(body).encode(), method="POST")
        with urllib.request.urlopen(req) as res:
            return json.loads(res.read())

    def test_R_B17_the_page_and_the_service_agree_on_a_whole_game(self):
        page = self.open(url=self.service_url + "/?seed=4242&clock=manual")
        self.assertEqual(page.title(), "Dewgrub")
        page.keyboard.press("ArrowRight")  # the first steer starts the game
        self.bot_manual(page, lambda s: s["score"] >= 40)
        mid = self.state(page)
        self.assertEqual(mid["status"], "playing")
        # Mid-game: the service, given the turns so far and the tick, shows the same board as the page.
        step = self.post("/api/step", {"seed": 4242, "log": mid["logText"], "ticks": mid["tick"]})
        self.assertEqual(step["hash"], mid["hash"])
        self.assertEqual(step["state"]["grub"], mid["grub"])
        self.assertEqual(step["state"]["dew"], mid["dew"])
        self.assertEqual((step["score"], step["length"]), (mid["score"], len(mid["grub"])))

        self.step(page, 60)  # stop steering: the grub runs into a wall
        end = self.state(page)
        self.assertEqual(end["status"], "over")
        self.assertGreaterEqual(end["score"], 40)
        replay = self.post("/api/replay", {"seed": 4242, "log": end["logText"], "finish": True})
        self.assertEqual((replay["hash"], replay["score"], replay["ticks"], replay["cause"], replay["status"]),
                         (end["hash"], end["score"], end["tick"], end["cause"], "over"))
        # Without finish the service stops where the log ends: the grub is still alive there.
        short = self.post("/api/replay", {"seed": 4242, "log": end["logText"]})
        self.assertEqual(short["status"], "playing")
        self.assertLess(short["ticks"], end["tick"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
