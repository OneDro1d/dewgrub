"""Browser tests, part 6 (v8): what a version says about itself is true at the commit that is checked out.

At tag v7 the page reported v6, and the README pointed at files that were only committed after the tag.
Test names carry the requirement id (docs/REQUIREMENTS.md, rules R-R*).
"""
import re
import subprocess
import unittest

from harness import BrowserCase, ROOT

# A word with one of these is a pattern for many paths ("evidence/vN/", "red-*.txt"), not one path.
PLACEHOLDERS = ("vN", "<", "*")
FILE_NAME = re.compile(r"`([\w.-]+\.(?:txt|md|mjs|js|py|sh|html|css|json))`")


def git(*args):
    return subprocess.run(["git", "-C", str(ROOT), *args], capture_output=True, text=True, check=True).stdout


def named_paths(text, tracked):
    """The paths a text names, as (path, is it in the repository).

    A path is a word that starts with a top-level folder of the repository and a slash ("tools/build.mjs",
    "evidence/v4/"), wherever it stands, or a file name with an extension between backticks ("red-output.txt").
    A folder is in the repository if a tracked file is inside it; a bare file name, if a tracked file has that name.
    """
    folders = sorted({name.split("/")[0] for name in tracked if "/" in name})
    word = re.compile(r"(?<![\w./-])((?:%s)/[^\s`'\"),;|]*)" % "|".join(map(re.escape, folders)))
    found = {}
    for m in word.finditer(text):
        path = m.group(1).rstrip(".:")
        if any(p in path for p in PLACEHOLDERS):
            continue
        prefix = path if path.endswith("/") else path + "/"
        found[path] = path in tracked or any(name.startswith(prefix) for name in tracked)
    base_names = {name.split("/")[-1] for name in tracked}
    for m in FILE_NAME.finditer(text):
        found.setdefault(m.group(1), m.group(1) in base_names)
    return sorted(found.items())


class ReleaseTests(BrowserCase):
    def test_R_R1_the_page_reports_the_version_being_built(self):
        page = self.open()
        shown = page.evaluate("window.__dewgrub.version")
        self.assertRegex(shown, r"^v[1-9]\d*$")
        number = int(shown[1:])

        # The README: the newest row of its table of versions, and the count in its numbers.
        readme = (ROOT / "README.md").read_text()
        rows = [int(n) for n in re.findall(r"^\| v(\d+) \|", readme, re.M)]
        self.assertEqual(rows, list(range(1, len(rows) + 1)), "the README's table of versions is not v1, v2, ... in order")
        self.assertEqual(number, rows[-1], f"the page reports {shown}, the README's newest version is v{rows[-1]}")
        count = re.search(r"^\| versions \| (\d+) \(tags `v1` to `v(\d+)`\) \|$", readme, re.M)
        self.assertIsNotNone(count, "the README's numbers have no row for the versions")
        self.assertEqual((int(count.group(1)), int(count.group(2))), (number, number))

        # The tags: on a tagged commit the page reports that tag. Between tags it reports the newest tag in the
        # history (a commit made after a tag) or the next one (work on the next version).
        tags = lambda *args: sorted(int(t[1:]) for t in git("tag", *args).split() if re.fullmatch(r"v[1-9]\d*", t))
        here = tags("--points-at", "HEAD")
        before = tags("--merged", "HEAD")
        self.assertTrue(before or number == 1, "no version tag in the history: this check needs a clone with its tags")
        if here:
            self.assertEqual(number, here[-1], f"the page reports {shown} on the commit tagged v{here[-1]}")
        elif before:
            self.assertIn(number, (before[-1], before[-1] + 1), f"the page reports {shown}, the newest tag in the history is v{before[-1]}")

    def test_R_R2_every_path_the_readme_names_is_in_the_repository(self):
        tracked = set(git("ls-files").split())
        self.assertGreater(len(tracked), 20)
        paths = named_paths((ROOT / "README.md").read_text(), tracked)
        self.assertGreater(len(paths), 40, "the README names far more paths than were found")
        self.maxDiff = None
        self.assertEqual([path for path, there in paths if not there], [], "the README names what is not in this commit")

        # The check itself, on a text with known faults: it must find each, and nothing else.
        sample = ("See `evidence/v999/` and evidence/v1/no-such-output.txt, `no-such-file.txt` and `README.md`.\n"
                  "    node tools/serve.mjs --flag\n    git show v4:evidence/v4/check-output.txt\n"
                  "Patterns: `evidence/vN/check-output.txt`, `red-*.txt`, `docs/<name>.md`. Not ours: `.tmp/jev/1.json`.")
        self.assertEqual(named_paths(sample, tracked), [
            ("README.md", True), ("evidence/v1/no-such-output.txt", False), ("evidence/v4/check-output.txt", True),
            ("evidence/v999/", False), ("no-such-file.txt", False), ("tools/serve.mjs", True)])


if __name__ == "__main__":
    unittest.main(verbosity=2)
