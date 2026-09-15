#!/usr/bin/env python3
"""Genere la banque de sons systeme NoxOS (synthese pure, identite sonore
commune : cloches douces + sub grave, style sombre/futuriste).

    python3 tools/mksounds.py assets/sounds

boot.mp3 et error.mp3 (fournis par l'auteur) ne sont jamais ecrases.
Necessite numpy + ffmpeg.
"""
import os
import subprocess
import sys

import numpy as np

SR = 48000


def env(n, attack=0.005, decay=0.6, curve=4.0):
    t = np.linspace(0, 1, n)
    a = np.clip(t * n / SR / attack, 0, 1)
    d = np.exp(-t * n / SR / decay * curve)
    return a * d


def bell(freq, dur, vol=1.0, decay=None, detune=0.0):
    """Cloche douce : fondamentale + harmoniques amorties + leger detune."""
    n = int(SR * dur)
    t = np.arange(n) / SR
    decay = decay or dur * 0.8
    f = freq * (1 + detune)
    s = (np.sin(2 * np.pi * f * t)
         + 0.35 * np.sin(2 * np.pi * f * 2.0 * t) * np.exp(-t * 6)
         + 0.15 * np.sin(2 * np.pi * f * 3.01 * t) * np.exp(-t * 9)
         + 0.08 * np.sin(2 * np.pi * f * 4.2 * t) * np.exp(-t * 12))
    return s * env(n, decay=decay) * vol


def sub(freq, dur, vol=0.5):
    n = int(SR * dur)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * freq * t) * env(n, attack=0.01, decay=dur * 0.5) * vol


def noise_tick(dur=0.04, vol=0.3, hp=2000):
    n = int(SR * dur)
    x = np.random.default_rng(7).standard_normal(n)
    # passe-haut grossier (difference)
    x = np.diff(x, prepend=0)
    return x * env(n, attack=0.001, decay=dur * 0.4) * vol / np.max(np.abs(x))


def seq(*items):
    """items = (offset_s, signal). Mixe sur une timeline."""
    total = max(int(o * SR) + len(s) for o, s in items)
    out = np.zeros(total)
    for o, s in items:
        i = int(o * SR)
        out[i:i + len(s)] += s
    return out


def reverb(x, amount=0.25, delays=(0.031, 0.047, 0.071, 0.113)):
    out = x.copy()
    for k, d in enumerate(delays):
        n = int(d * SR)
        g = amount * (0.7 ** k)
        y = np.zeros_like(x)
        y[n:] = x[:-n] * g
        out += y
    return out


def stereo(x, width=0.15):
    n = int(0.0004 * SR)
    l = np.concatenate([x, np.zeros(n)])
    r = np.concatenate([np.zeros(n), x]) * (1 - width) + l * width
    return np.stack([l, r], axis=1)


def finish(x, tail=0.25):
    x = reverb(x)
    x = np.concatenate([x, np.zeros(int(tail * SR))])
    x = x / (np.max(np.abs(x)) + 1e-9) * 0.85
    return stereo(x)


# Gamme NoxOS : Ré mineur (D4 = 293.66) -> identite commune a tous les sons
D4, F4, A4, C5, D5, F5, A5, D6 = 293.66, 349.23, 440.0, 523.25, 587.33, 698.46, 880.0, 1174.66
D3, A3 = 146.83, 220.0


def snd_shutdown():        # descente douce, 3 notes + sub
    return seq((0.00, bell(A5, 1.2, 0.8)),
               (0.28, bell(F5, 1.2, 0.8)),
               (0.56, bell(D5, 1.6, 0.9)),
               (0.56, sub(D3, 1.6, 0.35)))


def snd_login():           # montee, accueil
    return seq((0.00, bell(D5, 0.9, 0.7)),
               (0.18, bell(A5, 0.9, 0.7)),
               (0.36, bell(D6, 1.3, 0.8)),
               (0.36, sub(D3, 1.2, 0.3)))


def snd_logout():          # inverse de login, plus court
    return seq((0.00, bell(D6, 0.7, 0.7)),
               (0.18, bell(A5, 0.7, 0.7)),
               (0.36, bell(D5, 1.0, 0.8)))


def snd_notification():    # deux notes claires
    return seq((0.00, bell(A5, 0.5, 0.8)),
               (0.13, bell(D6, 0.8, 0.8)))


def snd_message():         # une seule note, discrete (chat/Noxia)
    return seq((0.0, bell(D6, 0.6, 0.8, detune=0.002)))


def snd_warning():         # tierce mineure descendante, sub d'alerte
    return seq((0.00, bell(F5, 0.6, 0.85)),
               (0.22, bell(D5, 0.9, 0.85)),
               (0.22, sub(D3, 0.9, 0.45)))


def snd_critical():        # trois notes graves repetees (arret critique, pas 'error')
    return seq((0.00, bell(D4, 0.5, 0.9)), (0.00, sub(D3, 0.5, 0.5)),
               (0.30, bell(D4, 0.5, 0.9)), (0.30, sub(D3, 0.5, 0.5)),
               (0.60, bell(A3, 1.2, 1.0)), (0.60, sub(D3, 1.2, 0.6)))


def snd_recycle():         # froissement + petite note grave
    return seq((0.00, noise_tick(0.12, 0.6)),
               (0.05, noise_tick(0.08, 0.4)),
               (0.10, bell(A3, 0.4, 0.5)))


def snd_device_connect():  # deux notes montantes courtes
    return seq((0.00, bell(A4, 0.35, 0.8)),
               (0.14, bell(D5, 0.6, 0.8)))


def snd_device_disconnect():
    return seq((0.00, bell(D5, 0.35, 0.8)),
               (0.14, bell(A4, 0.6, 0.8)))


def snd_screenshot():      # 'clic' d'obturateur
    return seq((0.00, noise_tick(0.03, 0.9, 4000)),
               (0.00, bell(D6, 0.15, 0.5)),
               (0.06, noise_tick(0.05, 0.5)))


def snd_minimize():
    return seq((0.00, bell(F5, 0.25, 0.6)), (0.07, bell(D5, 0.35, 0.6)))


def snd_maximize():
    return seq((0.00, bell(D5, 0.25, 0.6)), (0.07, bell(F5, 0.35, 0.6)))


def snd_lock():            # verrouillage : note + 'clic'
    return seq((0.00, bell(D5, 0.5, 0.7)), (0.10, noise_tick(0.03, 0.5)),
               (0.10, bell(A4, 0.6, 0.6)))


def snd_unlock():
    return seq((0.00, bell(A4, 0.4, 0.7)), (0.12, bell(D5, 0.7, 0.8)))


def snd_battery_low():     # portables uniquement : deux notes graves, insistantes
    return seq((0.00, bell(A4, 0.4, 0.8)), (0.00, sub(D3, 0.4, 0.4)),
               (0.35, bell(F4, 0.9, 0.9)), (0.35, sub(D3, 0.9, 0.5)))


def snd_charging():        # portables : branchement secteur
    return seq((0.00, bell(D5, 0.3, 0.7)), (0.10, bell(A5, 0.3, 0.7)), (0.20, bell(D6, 0.6, 0.8)))


def snd_download_done():   # telechargement / installation terminee
    return seq((0.00, bell(D5, 0.4, 0.7)), (0.15, bell(F5, 0.4, 0.7)),
               (0.30, bell(A5, 0.9, 0.85)), (0.30, sub(D3, 0.9, 0.3)))


def snd_click():           # clic UI tres court
    return seq((0.0, noise_tick(0.02, 0.6, 3000)), (0.0, bell(D6, 0.06, 0.3)))


def snd_volume():          # bip de reglage du volume
    return seq((0.0, bell(A5, 0.18, 0.7)))


SOUNDS = {
    "shutdown":          snd_shutdown,
    "login":             snd_login,
    "logout":            snd_logout,
    "notification":      snd_notification,
    "message":           snd_message,
    "warning":           snd_warning,
    "critical":          snd_critical,
    "recycle":           snd_recycle,
    "device-connect":    snd_device_connect,
    "device-disconnect": snd_device_disconnect,
    "screenshot":        snd_screenshot,
    "minimize":          snd_minimize,
    "maximize":          snd_maximize,
    "lock":              snd_lock,
    "unlock":            snd_unlock,
    "battery-low":       snd_battery_low,      # portables uniquement
    "charging":          snd_charging,         # portables uniquement
    "download-done":     snd_download_done,
    "click":             snd_click,
    "volume":            snd_volume,
}

PROTECTED = {"boot", "error"}


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "assets/sounds"
    os.makedirs(out, exist_ok=True)
    for name, fn in SOUNDS.items():
        if name in PROTECTED:
            continue
        x = finish(fn())
        pcm = (np.clip(x, -1, 1) * 32767).astype("<i2").tobytes()
        path = os.path.join(out, name + ".mp3")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "s16le", "-ar", str(SR),
                        "-ac", "2", "-i", "-", "-codec:a", "libmp3lame", "-q:a", "2", path],
                       input=pcm, check=True)
        print(f"{path}  {len(x) / SR:.2f}s")


if __name__ == "__main__":
    main()
