#!/usr/bin/env python3
"""Genere kernel/gfx/font8x16.c : police bitmap 8x16, glyphes 32..126 + 0
(case vide), rendue depuis une police monospace TrueType de la machine hote.

    python3 tools/genfont.py /usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf

Le fichier produit est commite : la compilation de NoxOS n'a pas besoin de
Python ni de la police.
"""
import sys
from PIL import Image, ImageDraw, ImageFont

W, H = 8, 16
path = sys.argv[1] if len(sys.argv) > 1 else "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
font = ImageFont.truetype(path, 14)

out = ["/* NoxOS - police bitmap 8x16 (generee par tools/genfont.py, ne pas editer) */",
       "#include <nox/gfx.h>", "",
       "const u8 font8x16[256][16] = {"]
for code in range(256):
    rows = [0] * H
    if 32 <= code < 127:
        img = Image.new("L", (W, H), 0)
        d = ImageDraw.Draw(img)
        d.text((0, -1), chr(code), font=font, fill=255)
        for y in range(H):
            bits = 0
            for x in range(W):
                if img.getpixel((x, y)) > 110:
                    bits |= 0x80 >> x
            rows[y] = bits
    out.append("    { " + ", ".join("0x%02X" % b for b in rows) + " }, /* %3d */" % code)
out.append("};")
open("kernel/gfx/font8x16.c", "w").write("\n".join(out) + "\n")
print("kernel/gfx/font8x16.c ecrit")
