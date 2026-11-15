"""Génère les icônes PWA (192/512, maskable, apple-touch-icon, favicon) sans dépendance externe hors Pillow.
Motif : mini-heatmap (tuiles vertes/rouges) sur fond sombre — aucun logo tiers."""
from PIL import Image, ImageDraw
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)
BG = (11, 15, 20)
# (x0, y0, x1, y1) en fraction de la zone utile, couleur
TILES = [
    ((0.00, 0.00, 0.58, 0.62), (22, 163, 74)),
    ((0.62, 0.00, 1.00, 0.36), (220, 38, 38)),
    ((0.62, 0.40, 1.00, 0.62), (21, 128, 61)),
    ((0.00, 0.66, 0.36, 1.00), (185, 28, 28)),
    ((0.40, 0.66, 0.70, 1.00), (34, 197, 94)),
    ((0.74, 0.66, 1.00, 1.00), (127, 29, 29)),
]

def render(size, safe, radius_frac):
    scale = 4
    S = size * scale
    img = Image.new("RGB", (S, S), BG)
    d = ImageDraw.Draw(img)
    pad = S * (1 - safe) / 2
    span = S - 2 * pad
    r = span * radius_frac
    for (x0, y0, x1, y1), col in TILES:
        d.rounded_rectangle(
            [pad + x0 * span, pad + y0 * span, pad + x1 * span, pad + y1 * span],
            radius=r, fill=col)
    return img.resize((size, size), Image.LANCZOS)

render(512, 0.74, 0.05).save(OUT / "icon-512.png", optimize=True)
render(192, 0.74, 0.05).save(OUT / "icon-192.png", optimize=True)
render(512, 0.58, 0.05).save(OUT / "maskable-512.png", optimize=True)
render(192, 0.58, 0.05).save(OUT / "maskable-192.png", optimize=True)
render(180, 0.70, 0.05).save(OUT / "apple-touch-icon.png", optimize=True)
render(32, 0.84, 0.04).save(OUT / "favicon-32.png", optimize=True)
print("icônes générées dans", OUT)
