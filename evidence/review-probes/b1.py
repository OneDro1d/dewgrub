import glob, os, re, json
from playwright.sync_api import sync_playwright

URL = "file:///home/coder/code/onedro1d/showcase-s2/dist/index.html"
found = glob.glob(os.path.expanduser("~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell"))
path = max(found, key=lambda p: int(re.search(r"shell-(\d+)", p).group(1))) if found else None

ST = "() => { const s = window.__dewgrub.state(); return {status:s.status, tick:s.tick, paused:s.paused, muted:s.muted, queue:s.queue, score:s.score, replaying:s.replaying}; }"

with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, executable_path=path) if path else pw.chromium.launch()

    def page(q="seed=123&clock=manual", **o):
        ctx = b.new_context(**(o or dict(viewport={"width": 900, "height": 760})))
        p = ctx.new_page()
        errs = []
        p.on("pageerror", lambda e: errs.append(str(e)))
        p.on("console", lambda m: errs.append(m.text) if m.type in ("error", "warning") else None)
        p.goto(URL + "?" + q)
        p.wait_for_function("() => window.__dewgrub !== undefined")
        p.errs = errs
        return p

    # A: keyboard user tabs to the Sound button and presses Enter / Space
    p = page()
    p.keyboard.press("Tab")
    print("A focus after Tab:", p.evaluate("() => document.activeElement && document.activeElement.id"))
    p.keyboard.press("Enter")
    print("A after Enter on focused #mute:", json.dumps(p.evaluate(ST)), "label:", p.inner_text("#mute"))
    p.keyboard.press("Tab")
    print("A focus after 2nd Tab:", p.evaluate("() => document.activeElement && document.activeElement.id"))

    # A2: keyboard user follows the replay link
    p = page("seed=123&clock=manual")
    p.keyboard.press("ArrowUp")
    p.evaluate("() => window.__dewgrub.step(30)")
    print("A2 status:", p.evaluate(ST)["status"], "href:", p.get_attribute("#replay", "href"))
    p.focus("#replay")
    p.wait_for_timeout(400)
    p.keyboard.press("Enter")
    p.wait_for_timeout(500)
    print("A2 after Enter on focused replay link: url=", p.url.split("index.html")[1], "state=", json.dumps(p.evaluate(ST)))

    # C: rotation / resize
    p = page("seed=123&clock=manual", viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True)
    p.set_viewport_size({"width": 844, "height": 390})
    p.wait_for_timeout(200)
    print("C rotated rects:", p.evaluate("() => { const r=document.getElementById('board').getBoundingClientRect(); return [r.left,r.top,r.right,r.bottom,innerWidth,innerHeight,document.scrollingElement.scrollHeight]; }"))

    # B: bar overflow with a 4-digit score text (SIMULATED text, not a real score) at narrow width
    for w, h in [(320, 568), (360, 640)]:
        p = page("seed=123&clock=manual", viewport={"width": w, "height": h}, has_touch=True, is_mobile=True)
        p.keyboard.press("ArrowUp")
        p.evaluate("() => window.__dewgrub.step(30)")
        p.evaluate("() => { document.getElementById('score').textContent = 'Score 1230'; }")
        print("B", w, p.evaluate("() => [...document.getElementById('bar').children].map(e => { const r=e.getBoundingClientRect(); return [e.id, Math.round(r.left), Math.round(r.right)]; })"), "innerWidth", w)

    # F: right click / middle click on canvas starts the game?
    p = page()
    p.mouse.click(450, 300, button="right")
    print("F after right click:", json.dumps(p.evaluate(ST)))

    # G: hidden tab while ready, then P on ready
    p = page()
    p.keyboard.press("p")
    print("G P at ready:", json.dumps(p.evaluate(ST)))

    # H: Space on a focused mute button after click (keyboard activation) -> start AND toggle?
    p = page()
    p.focus("#mute")
    p.keyboard.press("Space")
    print("H Space on focused #mute:", json.dumps(p.evaluate(ST)), p.inner_text("#mute"))

    # I: hostile urls
    for q in ["seed=" + "9" * 5000 + "&clock=manual", "seed=abc&replay=" + "0U." * 50000 + "0U", "seed=1&replay=0U.10L.20U&clock=manual", "seed=%00%ff&clock=manual"]:
        p = page(q)
        print("I", q[:40], "len", len(q), json.dumps(p.evaluate(ST)), "errs", p.errs)
    b.close()
