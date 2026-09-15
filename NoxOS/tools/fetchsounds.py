#!/usr/bin/env python3
"""Build the NoxOS system sound bank.

boot.mp3, error.mp3 and notification.mp3 are provided by the NoxOS author and are never touched.
Every other sound comes from the KDE Plasma "Ocean" sound theme
(https://invent.kde.org/plasma/ocean-sound-theme, CC-BY-SA-4.0,
Guilherme Marcal Silva), a professionally designed desktop-OS sound set.

Usage: python3 tools/fetchsounds.py assets/sounds
"""
import os
import subprocess
import sys
import tempfile

REPO = "https://invent.kde.org/plasma/ocean-sound-theme.git"
PROTECTED = {"boot.mp3", "error.mp3", "notification.mp3"}

# NoxOS event -> Ocean stereo file
SOUNDS = {
    "shutdown":          "desktop-logout.oga",
    "login":             "desktop-login.oga",
    "logout":            "service-logout.oga",
    # notification.mp3: LaSonotheque.fr "COMCell Message 1" (ID 1111), provided by the author
    "message":           "message-new-instant.oga",
    "warning":           "dialog-warning.oga",
    "critical":          "dialog-error-critical.oga",
    "recycle":           "trash-empty.oga",
    "device-connect":    "device-added.oga",
    "device-disconnect": "device-removed.oga",
    "screenshot":        "completion-success.oga",
    "minimize":          "message-contact-out.oga",
    "maximize":          "message-contact-in.oga",
    "lock":              "dialog-warning-auth.oga",
    "unlock":            "outcome-success.oga",
    "battery-low":       "battery-low.oga",      # laptops only
    "charging":          "power-plug.oga",       # laptops only
    "download-done":     "complete-media-burn.oga",
    "click":             "button-pressed.oga",
    "volume":            "audio-volume-change.oga",
}


def convert(src, dst):
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", src,
         "-af", "loudnorm=I=-16:TP=-1.5:LRA=7",
         "-ac", "2", "-ar", "44100", "-codec:a", "libmp3lame", "-q:a", "2", dst],
        check=True)


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "assets/sounds"
    os.makedirs(out, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["git", "clone", "-q", "--depth", "1", REPO, tmp], check=True)
        for name, src in SOUNDS.items():
            dst = os.path.join(out, name + ".mp3")
            if os.path.basename(dst) in PROTECTED:
                continue
            convert(os.path.join(tmp, "ocean", "stereo", src), dst)
            print(f"{dst:40s} <- ocean/{src}")


if __name__ == "__main__":
    main()
