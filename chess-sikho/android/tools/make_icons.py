#!/usr/bin/env python3
"""Launcher icons generate karo (pure Pillow, koi font zaroorat nahi).

Design: dark board, 4x4 muted squares, scarlet L-shaped knight jump + gold dot.
Output: res/mipmap-*/ic_launcher.png aur ic_launcher_round.png
"""
import math
import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
RES = os.path.normpath(os.path.join(HERE, "..", "app", "src", "main", "res"))

DENSITIES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
SS = 8  # supersampling

BG = (11, 12, 17, 255)
SQ_A = (27, 30, 42, 255)
SQ_B = (42, 46, 63, 255)
ACCENT = (255, 77, 94, 255)
GOLD = (245, 196, 81, 255)


def draw_icon(size):
    """size x size RGBA icon (square, full bleed)."""
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    u = S / 108.0  # design grid = 108 units (adaptive icon canvas)

    # rounded background
    r = 24 * u
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=r, fill=BG)

    # 4x4 muted board, from 26..82
    cell = 14 * u
    x0 = y0 = 26 * u
    for row in range(4):
        for col in range(4):
            fill = SQ_A if (row + col) % 2 == 0 else SQ_B
            x = x0 + col * cell
            y = y0 + row * cell
            d.rectangle([x, y, x + cell - 1, y + cell - 1], fill=fill)

    # knight jump: 2 cells up, 1 cell right (L shape), rounded corner
    w = 9 * u
    start = (34 * u, 76 * u)
    corner = (34 * u, 41 * u)
    end = (46 * u, 34 * u)
    d.line([start, corner], fill=ACCENT, width=int(round(w)))
    d.ellipse([corner[0] - w / 2, corner[1] - w / 2, corner[0] + w / 2, corner[1] + w / 2], fill=ACCENT)
    d.line([corner, end], fill=ACCENT, width=int(round(w)))
    # round the caps
    for p in (start, end):
        d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=ACCENT)

    # arrow head
    ah = [(44 * u, 25 * u), (62 * u, 34 * u), (44 * u, 43 * u)]
    d.polygon(ah, fill=ACCENT)

    # gold start dot
    gr = 6 * u
    d.ellipse([start[0] - gr, start[1] - gr, start[0] + gr, start[1] + gr], fill=GOLD)

    return img.resize((size, size), Image.LANCZOS)


def circle_crop(img):
    S = img.size[0]
    mask = Image.new("L", (S * SS, S * SS), 0)
    dm = ImageDraw.Draw(mask)
    dm.ellipse([0, 0, S * SS - 1, S * SS - 1], fill=255)
    mask = mask.resize((S, S), Image.LANCZOS)
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def main():
    for density, size in DENSITIES.items():
        outdir = os.path.join(RES, "mipmap-" + density)
        os.makedirs(outdir, exist_ok=True)
        icon = draw_icon(size)
        icon.save(os.path.join(outdir, "ic_launcher.png"))
        circle_crop(icon).save(os.path.join(outdir, "ic_launcher_round.png"))
        print("wrote", outdir, size)

    # Play Store / README ke liye ek bada icon
    big = draw_icon(512)
    big.save(os.path.join(HERE, "..", "..", "app-icon.png"))
    print("wrote app-icon.png (512)")


if __name__ == "__main__":
    main()
