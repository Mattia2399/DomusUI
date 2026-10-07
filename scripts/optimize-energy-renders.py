"""Generate AVIF and WebP copies of the Energy house renders.

The PNG originals stay the source of truth and the final fallback. Run after
adding or changing a render:

    python scripts/optimize-energy-renders.py

Requires Pillow 11.3+ built with WebP and AVIF support. The quality settings keep
the dark gradients and glass highlights free of visible banding at the sizes the
page displays.
"""

from pathlib import Path

from PIL import Image, features

RENDERS = Path(__file__).resolve().parent.parent / "public" / "images" / "energy" / "mobile"
WEBP = {"quality": 82, "method": 6}
AVIF = {"quality": 60, "speed": 4}


def main() -> None:
    if not (features.check("webp") and features.check("avif")):
        raise SystemExit("Pillow needs WebP and AVIF support to generate the renders.")
    for png in sorted(RENDERS.glob("*.png")):
        with Image.open(png) as image:
            rgb = image.convert("RGB") if image.mode not in ("RGB", "RGBA") else image
            rgb.save(png.with_suffix(".webp"), "WEBP", **WEBP)
            rgb.save(png.with_suffix(".avif"), "AVIF", **AVIF)
        sizes = {suffix: png.with_suffix(suffix).stat().st_size for suffix in (".png", ".webp", ".avif")}
        print(png.name, " ".join(f"{suffix[1:]}={size}" for suffix, size in sizes.items()))


if __name__ == "__main__":
    main()
