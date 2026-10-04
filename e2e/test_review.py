"""Browser tests, part 3: written for the defects the blind review found (evidence/review.md).

They were written and seen failing on the v3 page first (evidence/v4/red-output.txt), then the page was fixed.
"""
import unittest

from harness import BrowserCase


class ReviewTests(BrowserCase):
    def test_R_B13_enter_and_space_on_the_sound_button_toggle_sound_and_do_not_start(self):
        page = self.open("seed=123&clock=manual")
        page.focus("#mute")
        page.keyboard.press("Enter")
        s = self.state(page)
        self.assertEqual((s["status"], s["muted"]), ("ready", True))
        self.assertEqual(page.inner_text("#mute"), "Sound: off")
        page.focus("#mute")
        page.keyboard.press("Space")
        s = self.state(page)
        self.assertEqual((s["status"], s["muted"]), ("ready", False))
        # Arrow keys still steer while the button has focus.
        page.focus("#mute")
        page.keyboard.press("ArrowUp")
        self.assertEqual(self.state(page)["status"], "playing")

    def test_R_B13_enter_on_the_replay_link_opens_the_replay(self):
        page = self.open("seed=123&clock=manual")
        page.keyboard.press("ArrowUp")
        self.step(page, 30)
        self.assertEqual(self.state(page)["status"], "over")
        page.wait_for_timeout(450)
        page.focus("#replay")
        target = self.base + "?seed=123&replay=0U"
        self.loaded.append(target)
        with page.expect_navigation():
            page.keyboard.press("Enter")
        self.assertEqual(page.url, target)
        page.wait_for_function("() => window.__dewgrub !== undefined")
        self.assertTrue(self.state(page)["replaying"])

    def test_R_B13_only_the_left_mouse_button_plays(self):
        page = self.open("seed=123&clock=manual")
        page.mouse.click(300, 300, button="right")
        self.assertEqual(self.state(page)["status"], "ready")
        page.mouse.click(300, 300, button="middle")
        self.assertEqual(self.state(page)["status"], "ready")
        page.mouse.click(300, 300)
        self.assertEqual(self.state(page)["status"], "playing")
        # A mouse drag steers like a swipe.
        page.mouse.move(300, 300)
        page.mouse.down()
        page.mouse.move(300, 240, steps=3)
        page.mouse.up()
        self.assertEqual(self.step(page, 1)["dir"], "U")

    def test_R_B14_the_board_label_tells_the_game_status(self):
        page = self.open("seed=123&clock=manual")
        label = lambda: page.get_attribute("#board", "aria-label")
        self.assertIn("Press Space or tap to start", label())
        page.keyboard.press("ArrowUp")
        self.assertIn("Playing", label())
        page.keyboard.press("p")
        self.assertIn("Paused", label())
        page.keyboard.press("p")
        self.step(page, 30)
        self.assertIn("Game over", label())
        self.assertIn("hit the wall", label())
        self.assertIn("Score 0", label())
        html = page.content()
        self.assertNotIn("user-scalable", html)


if __name__ == "__main__":
    unittest.main(verbosity=2)
