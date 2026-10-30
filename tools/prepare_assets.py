#!/usr/bin/env python3
"""
prepare_assets.py
-----------------
Turns the original 16:9 concept renders (assets/*.jpg) into transparent,
game-ready sprites for the isometric grid.

Pipeline per image:
  1. (optional) crop a region of the source (used to isolate the pipe in the
     duct render, which also contains a habitat dome).
  2. Remove the studio background + baked shadow with rembg (u2net).
     A pure-Pillow flood-fill fallback is used when rembg is not installed.
  3. Trim the empty margin, add transparent padding and resize.
  4. Save an optimised PNG in assets/buildings/.

Run from the project root:
    pip install rembg onnxruntime
    python tools/prepare_assets.py

The generated PNGs are committed to the repository, so players do not need
Python to run the game.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "assets"
OUT_DIR = SRC_DIR / "buildings"

# Source file -> game building id (ids match js/config.js).
# "crop" is an optional fractional box (left, top, right, bottom) applied
# before background removal.
ASSET_MAP = {
    "area_convivencia": {"id": "habitat"},
    "gerador_co2": {"id": "oxygen-generator"},
    "extrator_agua": {"id": "water-extractor"},
    "painel_solar": {"id": "solar-panel"},
    "dutos_conexao": {"id": "duct", "crop": (0.38, 0.28, 1.0, 0.98)},
    "dormitorio": {"id": "dormitory"},
    "cozinha": {"id": "cafeteria"},
    "estufa": {"id": "greenhouse"},
    "estoque": {"id": "warehouse"},
    "fabrica": {"id": "factory"},
    "mina_recursos": {"id": "mine"},
    "oficina": {"id": "workshop"},
}

OUTPUT_WIDTH = 620     # px, plenty for a 2x2 tile at 2x zoom
PADDING = 6            # px kept around the trimmed silhouette

# Background-removal fallback tuning ----------------------------------------
BG_TOLERANCE = 26
EDGE_SOFTNESS = 2


def cut_with_rembg(img: Image.Image, session) -> Image.Image:
    """Best-quality cut-out: also removes the baked shadow."""
    from rembg import remove

    return remove(img, session=session, alpha_matting=False, post_process_mask=False)


def cut_with_floodfill(img: Image.Image) -> Image.Image:
    """Fallback used when rembg is not available. Keeps soft shadows."""
    rgb = np.asarray(img.convert("RGB"), dtype=np.int16)
    h, w = rgb.shape[:2]
    frame = np.concatenate(
        [
            rgb[:6, :, :].reshape(-1, 3),
            rgb[-6:, :, :].reshape(-1, 3),
            rgb[:, :6, :].reshape(-1, 3),
            rgb[:, -6:, :].reshape(-1, 3),
        ]
    )
    bg = np.median(frame, axis=0)
    dist = np.sqrt(((rgb - bg) ** 2).sum(axis=2))
    bg_like = (dist < BG_TOLERANCE).astype(np.uint8) * 255

    # Pillow's floodfill is unreliable in "L" mode, hence the RGB mask.
    mask_rgb = np.dstack([bg_like, bg_like, bg_like])
    mask_img = Image.fromarray(mask_rgb)
    border_points = (
        [(x, 0) for x in range(w)]
        + [(x, h - 1) for x in range(w)]
        + [(0, y) for y in range(h)]
        + [(w - 1, y) for y in range(h)]
    )
    for point in border_points:
        if mask_img.getpixel(point)[0] != 255:
            continue
        ImageDraw.floodfill(mask_img, point, (128, 0, 0), thresh=0)

    mask = np.asarray(mask_img)
    is_bg = (mask[:, :, 0] == 128) & (mask[:, :, 1] == 0)

    alpha = np.where(is_bg, 0, 255).astype(np.uint8)
    band = (
        np.asarray(
            Image.fromarray((is_bg * 255).astype(np.uint8)).filter(
                ImageFilter.MaxFilter(EDGE_SOFTNESS * 2 + 1)
            )
        )
        > 0
    ) & ~is_bg
    band_alpha = np.clip((dist - 6) / 34.0, 0.0, 1.0) * 255.0
    alpha[band] = band_alpha[band].astype(np.uint8)

    return Image.fromarray(np.dstack([rgb.astype(np.uint8), alpha]))


def normalise(out: Image.Image) -> Image.Image:
    """Trim transparent margins, resize and add uniform padding."""
    bbox = out.getbbox()
    if bbox:
        out = out.crop(bbox)
    if out.width > OUTPUT_WIDTH:
        ratio = OUTPUT_WIDTH / out.width
        out = out.resize(
            (OUTPUT_WIDTH, max(1, round(out.height * ratio))), Image.LANCZOS
        )
    canvas = Image.new(
        "RGBA", (out.width + PADDING * 2, out.height + PADDING * 2), (0, 0, 0, 0)
    )
    canvas.alpha_composite(out, (PADDING, PADDING))
    return canvas


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    session = None
    try:
        from rembg import new_session

        print("Using rembg (u2net) for background removal...")
        session = new_session("u2net")
    except Exception as exc:  # pragma: no cover - depends on environment
        print(f"rembg unavailable ({exc}); falling back to flood-fill cut-out.")

    missing = 0
    for src_name, opts in ASSET_MAP.items():
        src = SRC_DIR / f"{src_name}.jpg"
        if not src.exists():
            print(f"  ! missing source: {src}")
            missing += 1
            continue

        with Image.open(src) as img:
            img = img.convert("RGB")
            crop = opts.get("crop")
            if crop:
                w, h = img.size
                box = (
                    round(crop[0] * w),
                    round(crop[1] * h),
                    round(crop[2] * w),
                    round(crop[3] * h),
                )
                img = img.crop(box)
            result = (
                cut_with_rembg(img, session) if session else cut_with_floodfill(img)
            )

        result = normalise(result)
        dest = OUT_DIR / f"{opts['id']}.png"
        result.save(dest, "PNG", optimize=True)
        print(
            f"  {src.name:22s} -> {dest.relative_to(ROOT)}  "
            f"({result.width}x{result.height})"
        )

    print(f"\nDone. {len(ASSET_MAP) - missing}/{len(ASSET_MAP)} assets prepared.")
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
