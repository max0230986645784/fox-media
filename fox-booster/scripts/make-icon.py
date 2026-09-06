"""Génère build/icon.png (512x512) : un éclair sur fond dégradé orange Fox."""
from pathlib import Path

from PIL import Image, ImageDraw

SIZE = 512
OUT = Path(__file__).resolve().parent.parent / "build" / "icon.png"


def main() -> None:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Fond arrondi avec dégradé vertical orange -> rouge-brun.
    bg = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    bg_draw = ImageDraw.Draw(bg)
    for y in range(SIZE):
        t = y / SIZE
        color = (int(255 - 60 * t), int(140 - 90 * t), int(40 - 30 * t), 255)
        bg_draw.line([(0, y), (SIZE, y)], fill=color)
    mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=110, fill=255)
    img.paste(bg, (0, 0), mask)

    # Oreilles de renard.
    draw.polygon([(120, 250), (150, 90), (240, 210)], fill=(255, 230, 200, 255))
    draw.polygon([(392, 250), (362, 90), (272, 210)], fill=(255, 230, 200, 255))
    # Tête.
    draw.ellipse([116, 170, 396, 430], fill=(255, 230, 200, 255))
    # Éclair (boost) au centre.
    bolt = [(275, 190), (200, 320), (255, 320), (225, 425), (315, 280), (262, 280), (300, 190)]
    draw.polygon(bolt, fill=(30, 20, 15, 255))
    draw.polygon([(p[0] - 6, p[1] - 6) for p in bolt], fill=(255, 122, 26, 255))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT)
    print(f"icone : {OUT}")


if __name__ == "__main__":
    main()
