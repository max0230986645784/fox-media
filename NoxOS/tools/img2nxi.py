#!/usr/bin/env python3
"""Convertit une image (PNG/JPG) en image NoxOS .nxi :
    python3 tools/img2nxi.py in.png out.nxi [largeur hauteur]

Format .nxi (little-endian) :
    u32 magic 'NXIM' (0x4D49584E), u32 largeur, u32 hauteur, u32 bpp (16)
    puis largeur*hauteur pixels RGB565.
Le kernel (gfx_load_nxi) convertit en 32 bpp au chargement. L'image est
redimensionnee et recadree ("cover") a la taille demandee. Les .nxi sont
commites : la compilation de NoxOS n'a pas besoin de Python."""
import sys, struct
from PIL import Image, ImageOps

src, dst = sys.argv[1], sys.argv[2]
w = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
h = int(sys.argv[4]) if len(sys.argv) > 4 else 768
img = ImageOps.fit(Image.open(src).convert("RGB"), (w, h), Image.LANCZOS)
with open(dst, "wb") as f:
    f.write(struct.pack("<4sIII", b"NXIM", w, h, 16))
    px = bytearray()
    for r, g, b in img.getdata():
        px += struct.pack("<H", ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3))
    f.write(px)
print(dst, w, "x", h, "rgb565")
