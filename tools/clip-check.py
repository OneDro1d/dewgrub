"""Reads the recorded clip back: prints its real length, size and streams, and saves a few frames as pictures
into .tmp/clip/frames/ for a person to look at. The numbers come from the file, not from the recording script.

Needs an ffmpeg: the `imageio-ffmpeg` Python package if installed, else `ffmpeg` on the PATH.
Usage, from the repository root:   python3 tools/clip-check.py [seed]
"""
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 2194
clip = ROOT / ".tmp" / "clip" / f"dewgrub-seed{SEED}.webm"
frames = ROOT / ".tmp" / "clip" / "frames"

try:
    import imageio_ffmpeg
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
except ImportError:
    ffmpeg = shutil.which("ffmpeg")
if not ffmpeg:
    sys.exit("no ffmpeg found")
if not clip.exists():
    sys.exit(f"no clip at {clip.relative_to(ROOT)}: run tools/clip.py first")

# Decode the whole file: the length ffmpeg reports after decoding is the real one.
info = subprocess.run([ffmpeg, "-hide_banner", "-i", str(clip), "-f", "null", "-"], capture_output=True, text=True).stderr
streams = re.findall(r"Stream #\S+ (Video|Audio): ([^\n]*)", info.split("Output #0")[0])  # the input's streams only
times = re.findall(r"time=(\d+):(\d+):(\d+\.\d+)", info)
h, m, s = times[-1]
seconds = int(h) * 3600 + int(m) * 60 + float(s)
size = re.search(r"(\d{3,4})x(\d{3,4})", next(d for kind, d in streams if kind == "Video"))

print(f"file:           {clip.relative_to(ROOT)}")
print(f"bytes:          {clip.stat().st_size}")
print(f"length:         {seconds:.1f} s")
print(f"picture size:   {size.group(1)}x{size.group(2)}")
print(f"video streams:  {sum(1 for kind, _ in streams if kind == 'Video')}")
print(f"audio streams:  {sum(1 for kind, _ in streams if kind == 'Audio')}")

frames.mkdir(parents=True, exist_ok=True)
for at in (2, 9, 18, 22, 30, seconds - 1):
    out = frames / f"at-{at:04.1f}s.png"
    subprocess.run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{at:.1f}", "-i", str(clip),
                    "-frames:v", "1", "-vf", "scale=540:540", str(out)], check=True)
    print(f"frame:          {out.relative_to(ROOT)}")
