"""Browser tests, part 4 (v5): the repository is fit for strangers and the page works from a sub-path.

Test names carry the requirement id (docs/REQUIREMENTS.md).
"""
import functools
import http.server
import re
import subprocess
import threading
import unittest

from harness import BrowserCase, DIST, KEY, ROOT


# What no tracked file and no commit may contain. Written in pieces so that this file does not contain it either.
FORBIDDEN = [
    ("a home folder path", re.compile("/ho" + "me/")),
    ("a per-user temp path", re.compile("/tmp/cl" + "aude")),
    ("the operator's name", re.compile("mic" + "ha[lł]|ba" + "cia", re.I)),
    ("an internal workspace word", re.compile("note" + "pad|nun" + "tius|in" + r"box\b|out" + r"box\b", re.I)),
    ("an internal machine or store name", re.compile("smm" + "-venv|onedro" + "1d|engram" + "-prod", re.I)),
    ("the internal word for the task", re.compile(r"\bbri" + r"ef\b", re.I)),
]
# The one identity every commit carries: a role, not a person.
NEUTRAL = "OneDroid Showcase Builder <showcase-builder@users.noreply.onedroid.ai>"


class SubPathHandler(http.server.SimpleHTTPRequestHandler):
    """Serves dist/ under /dewgrub/ only. Anything else is a 404, as on a host that serves the repo from a sub-path."""

    def log_message(self, *args):
        pass

    def translate_path(self, path):
        clean = path.split("?", 1)[0].split("#", 1)[0]
        if not clean.startswith("/dewgrub/"):
            return str(DIST / "no-such-file")
        return super().translate_path(clean[len("/dewgrub"):])


class PublicTests(BrowserCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        handler = functools.partial(SubPathHandler, directory=str(DIST))
        cls.sub_server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        threading.Thread(target=cls.sub_server.serve_forever, daemon=True).start()
        cls.sub_base = f"http://127.0.0.1:{cls.sub_server.server_address[1]}/dewgrub/"

    @classmethod
    def tearDownClass(cls):
        cls.sub_server.shutdown()
        cls.sub_server.server_close()
        super().tearDownClass()

    def test_R_B15_works_from_a_sub_path(self):
        # The address ends in "/dewgrub/", with no file name: the host serves index.html for the folder.
        page = self.open(url=self.sub_base + "?seed=123&clock=manual")
        self.assertEqual(page.title(), "Dewgrub")
        page.keyboard.press("ArrowRight")  # the first steer starts the game
        presses, _ = self.bot_manual(page, lambda s: s["score"] >= 30)
        self.step(page, 60)
        s = self.state(page)
        self.assertEqual(s["status"], "over")
        self.assertEqual(s["seed"], 123)
        self.assertGreaterEqual(s["score"], 30)

        # The replay link stays inside the sub-path and plays the same run back.
        target = self.sub_base + f"?seed=123&replay={s['logText']}"
        self.loaded.append(target)
        with page.expect_navigation():
            page.click("#replay")
        self.assertEqual(page.url, target)
        page.wait_for_function("() => window.__dewgrub !== undefined")
        self.assertTrue(self.state(page)["replaying"])
        self.wait_status(page, "over", timeout=90000)
        r = self.state(page)
        self.assertEqual((r["hash"], r["score"]), (s["hash"], s["score"]))
        # Nothing was asked from outside the sub-path (tearDown also checks that only the page itself was loaded).
        self.assertTrue(all(u.startswith(self.sub_base) for u in self.requests), self.requests)

    def test_R_B15_the_sub_path_server_really_refuses_the_root(self):
        # Guards the test above: if the test server also answered at "/", a root-absolute link would go unnoticed.
        import urllib.error
        import urllib.request
        root = self.sub_base.replace("/dewgrub/", "/")
        with self.assertRaises(urllib.error.HTTPError) as caught:
            urllib.request.urlopen(root + "index.html")
        self.assertEqual(caught.exception.code, 404)
        caught.exception.close()
        with urllib.request.urlopen(self.sub_base) as ok:
            self.assertEqual(ok.status, 200)

    def test_R_B16_no_machine_path_and_no_internal_name_in_any_tracked_file(self):
        files = subprocess.run(["git", "-C", str(ROOT), "ls-files"], capture_output=True, text=True, check=True)
        names = files.stdout.split()
        self.assertGreater(len(names), 20)
        hits = []
        for name in names:
            text = (ROOT / name).read_text(errors="replace")
            for what, pattern in FORBIDDEN:
                for m in pattern.finditer(text):
                    line = text.count("\n", 0, m.start()) + 1
                    hits.append(f"{name}:{line}: {what}")
        self.maxDiff = None
        self.assertEqual(hits, [])

    def test_R_B16_no_personal_name_or_address_in_the_git_history(self):
        # Every commit reachable from a branch or a tag: author and committer are the one neutral identity.
        log = subprocess.run(
            ["git", "-C", str(ROOT), "log", "--branches", "--tags", "--format=%an <%ae> | %cn <%ce>"],
            capture_output=True, text=True, check=True).stdout.splitlines()
        self.assertGreater(len(log), 10)
        self.assertEqual(sorted(set(log)), [f"{NEUTRAL} | {NEUTRAL}"])
        # And no commit message carries what the tracked files may not carry.
        messages = subprocess.run(
            ["git", "-C", str(ROOT), "log", "--branches", "--tags", "--format=%H%n%B"],
            capture_output=True, text=True, check=True).stdout
        hits = [what for what, pattern in FORBIDDEN if pattern.search(messages)]
        self.assertEqual(hits, [])

    def test_R_B16_the_license_is_mit_and_the_readme_says_so(self):
        text = (ROOT / "LICENSE").read_text()
        self.assertTrue(text.startswith("MIT License"))
        self.assertIn("Copyright (c) 2026 OneDroid", text)
        self.assertTrue("MIT license" in (ROOT / "README.md").read_text(), "the README does not name the MIT license")


if __name__ == "__main__":
    unittest.main(verbosity=2)
