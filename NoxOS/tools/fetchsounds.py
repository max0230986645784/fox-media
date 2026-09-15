#!/usr/bin/env python3
"""Download and normalise the NoxOS system sound bank.

boot.mp3 and error.mp3 are provided by the NoxOS author and are never touched.
Every other sound comes from a royalty-free library:
  - Mixkit (https://mixkit.co/license/) : assets.mixkit.co/active_storage/sfx/<id>/<id>-preview.mp3
  - Kenney "Interface Sounds" (CC0)     : https://kenney.nl/assets/interface-sounds

Usage: python3 tools/fetchsounds.py assets/sounds
"""
import io
import os
import subprocess
import sys
import urllib.request
import zipfile

MIXKIT = "https://assets.mixkit.co/active_storage/sfx/{id}/{id}-preview.mp3"
KENNEY = "https://kenney.nl/assets/interface-sounds"
PROTECTED = {"boot.mp3", "error.mp3"}

# event -> ("mixkit", id) | ("kenney", file)
SOUNDS = {
    "shutdown":          ("mixkit", 2669),   # Short sci-fi swell
    "login":             ("mixkit", 2574),   # Software interface start
    "logout":            ("mixkit", 2575),   # Software interface back
    "notification":      ("mixkit", 951),    # Positive notification
    "message":           ("mixkit", 2354),   # Message pop alert
    "warning":           ("mixkit", 2868),   # Double beep tone alert
    "critical":          ("mixkit", 898),    # Sci-Fi error alert
    "recycle":           ("kenney", "drop_002.ogg"),
    "device-connect":    ("mixkit", 2869),   # Access allowed tone
    "device-disconnect": ("mixkit", 2569),   # Negative tone interface tap
    "screenshot":        ("mixkit", 2364),   # Hard pop click
    "minimize":          ("kenney", "minimize_006.ogg"),
    "maximize":          ("kenney", "maximize_006.ogg"),
    "lock":              ("mixkit", 2848),   # Gaming lock
    "unlock":            ("mixkit", 2349),   # Video game magic item unlock
    "battery-low":       ("mixkit", 987),    # Game notification wave alarm (laptops only)
    "charging":          ("mixkit", 2837),   # Video game health recharge (laptops only)
    "download-done":     ("mixkit", 2039),   # Game success alert
    "click":             ("mixkit", 2568),   # Cool interface click tone
    "volume":            ("mixkit", 2580),   # Light button
}


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def kenney_zip():
    page = fetch(KENNEY).decode("utf-8", "replace")
    key = "kenney_interface-sounds.zip"
    i = page.find(key)
    start = page.rfind("https://", 0, i)
    return zipfile.ZipFile(io.BytesIO(fetch(page[start:i + len(key)])))


def convert(src_bytes, ext, dst):
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", ext, "-i", "pipe:0",
         "-af", "loudnorm=I=-16:TP=-1.5:LRA=7,afade=t=out:st=0:d=0",
         "-ac", "2", "-ar", "44100", "-codec:a", "libmp3lame", "-q:a", "2", dst],
        input=src_bytes, check=True)


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "assets/sounds"
    os.makedirs(out, exist_ok=True)
    kz = None
    for name, (src, ref) in SOUNDS.items():
        dst = os.path.join(out, name + ".mp3")
        if os.path.basename(dst) in PROTECTED:
            continue
        if src == "mixkit":
            data, ext = fetch(MIXKIT.format(id=ref)), "mp3"
        else:
            kz = kz or kenney_zip()
            member = next(n for n in kz.namelist() if n.endswith("/" + ref))
            data, ext = kz.read(member), "ogg"
        convert(data, ext, dst)
        print(f"{dst:40s} <- {src}:{ref}")


if __name__ == "__main__":
    main()
