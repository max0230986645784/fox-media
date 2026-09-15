#!/usr/bin/env python3
"""Convertit une image en RGBA brut 32 bpp (0xAARRGGBB little-endian, tel que
lu par gfx_draw_rgba) : python3 tools/png2rgba.py in.png out.rgba [taille]

Le fichier .rgba n'a pas d'en-tete : sa taille est w*h*4 et l'image est
carree, le kernel en deduit la dimension. Les .rgba sont commites, la
compilation de NoxOS n'a pas besoin de Python."""
import sys, struct
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
size = int(sys.argv[3]) if len(sys.argv) > 3 else 192
img = Image.open(src).convert("RGBA").resize((size, size), Image.LANCZOS)
with open(dst, "wb") as f:
    for r, g, b, a in img.getdata():
        f.write(struct.pack("<I", (a << 24) | (r << 16) | (g << 8) | b))
print(dst, size, "x", size)
