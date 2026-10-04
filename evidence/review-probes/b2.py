import glob, os, re, json
from playwright.sync_api import sync_playwright

URL = "file:///home/coder/code/onedro1d/showcase-s2/dist/index.html?seed=123&clock=manual"
found = glob.glob(os.path.expanduser("~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell"))
path = max(found, key=lambda p: int(re.search(r"shell-(\d+)", p).group(1)))
RECTS = """() => { const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return [id, Math.round(b.top), Math.round(b.bottom), Math.round(b.left), Math.round(b.right)]; };
  return { board: r('board'), bar: r('bar'), barOffsetH: document.getElementById('bar').offsetHeight, canvasCss: document.getElementById('board').style.height, innerH: innerHeight, innerW: innerWidth, dpr: devicePixelRatio }; }"""

with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, executable_path=path)
    for opts, label in [(dict(viewport={"width": 844, "height": 390}, has_touch=True, is_mobile=True), "fresh 844x390")]:
        ctx = b.new_context(**opts); p = ctx.new_page(); p.goto(URL)
        p.wait_for_function("() => window.__dewgrub !== undefined")
        print(label, json.dumps(p.evaluate(RECTS)))
    ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True); p = ctx.new_page(); p.goto(URL)
    p.wait_for_function("() => window.__dewgrub !== undefined")
    print("fresh 390x844", json.dumps(p.evaluate(RECTS)))
    p.set_viewport_size({"width": 844, "height": 390}); p.wait_for_timeout(300)
    print("rotated to 844x390", json.dumps(p.evaluate(RECTS)))
    p.set_viewport_size({"width": 390, "height": 844}); p.wait_for_timeout(300)
    print("rotated back", json.dumps(p.evaluate(RECTS)))
    # desktop resize
    ctx = b.new_context(viewport={"width": 900, "height": 760}); p = ctx.new_page(); p.goto(URL)
    p.wait_for_function("() => window.__dewgrub !== undefined")
    p.set_viewport_size({"width": 500, "height": 300}); p.wait_for_timeout(300)
    print("desktop shrunk to 500x300", json.dumps(p.evaluate(RECTS)))
    # 320 wide with 3-digit simulated score
    ctx = b.new_context(viewport={"width": 320, "height": 568}, has_touch=True, is_mobile=True); p = ctx.new_page(); p.goto(URL)
    p.wait_for_function("() => window.__dewgrub !== undefined")
    p.keyboard.press("ArrowUp"); p.evaluate("() => window.__dewgrub.step(30)")
    for txt in ["Score 0", "Score 100", "Score 1230"]:
        p.evaluate("t => { document.getElementById('score').textContent = t; }", txt)
        print("320 wide", txt, p.evaluate("() => [...document.getElementById('bar').children].map(e => { const r=e.getBoundingClientRect(); return [e.id, Math.round(r.left), Math.round(r.right)]; })"))
    b.close()
