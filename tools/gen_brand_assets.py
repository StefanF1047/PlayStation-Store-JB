#!/usr/bin/env python3
"""Generate every product image from a single master picture.

Master:  assets/home-photo.png

Derived (all regenerated, never hand-edited):
    assets/icon0.png                       PS5 app icon (512x512)
    assets/icon.ico                        Windows .exe icon
    assets/pic0.png                        PS5 focus art copy (1920x1080)
    store/icon0.png                        Store-tile icon (512x512)
    store/pic0.png                         PS5 home menu focus art (1920x1080)
    frontend/autoloader/logo.png           in-page wordmark art (512x512)
    frontend/installer-page/logo.png       in-page wordmark art (512x512)
    frontend/autoloader/favicon.png        browser icon (256x256)
    frontend/installer-page/favicon.png    browser icon (256x256)
    frontend/autoloader/store-tile-icon.png small tile art (128x128)
    frontend/autoloader/wobkot/jb-lock.png  exploit page art (256x256)
    docs/img/banner.png                    README banner (1600x400)

Swap in your own picture with either of:
    make photo PHOTO=/path/to/picture.jpg          # one picture for everything
    python3 tools/gen_brand_assets.py --photo /path/to/picture.jpg

Or use separate masters (recommended for a stock look):
    assets/store-icon.png   -> tile icon, logos, favicons (square, 512x512)
    assets/store-bg.png     -> hover/focus art (1920x1080) + README banner
    make icon PHOTO=/path/to/icon.png
    make background PHOTO=/path/to/background.png
    make stock-bg           # neutral PS-blue background

The picture is cropped (cover) per output, so any aspect ratio works.
Rendering uses Pillow when installed, otherwise ImageMagick.
"""

import argparse
import os
import shutil
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MASTER = os.path.join(ROOT, "assets", "home-photo.png")
ICON_MASTER = os.path.join(ROOT, "assets", "store-icon.png")
BG_MASTER = os.path.join(ROOT, "assets", "store-bg.png")

# (relative path, width, height, source kind)
OUTPUTS = (
    ("assets/icon0.png", 512, 512, "icon"),
    ("assets/pic0.png", 1920, 1080, "bg"),
    ("store/icon0.png", 512, 512, "icon"),
    ("store/pic0.png", 1920, 1080, "bg"),
    ("frontend/autoloader/logo.png", 512, 512, "icon"),
    ("frontend/installer-page/logo.png", 512, 512, "icon"),
    ("frontend/autoloader/favicon.png", 256, 256, "icon"),
    ("frontend/installer-page/favicon.png", 256, 256, "icon"),
    ("frontend/autoloader/store-tile-icon.png", 128, 128, "icon"),
    ("frontend/autoloader/wobkot/jb-lock.png", 256, 256, "icon"),
    ("docs/img/banner.png", 1600, 400, "bg"),
)


def master_path(kind):
    """Per-kind master, falling back to the single home-photo master."""
    if kind == "icon" and os.path.isfile(ICON_MASTER):
        return ICON_MASTER
    if kind == "bg" and os.path.isfile(BG_MASTER):
        return BG_MASTER
    return MASTER

ICO_PATH = os.path.join(ROOT, "assets", "icon.ico")
ICO_SIZES = (16, 24, 32, 48, 64, 128, 256)


def magick_command():
    """Return the ImageMagick binary name, or None when it is unavailable."""
    for name in ("magick", "convert"):
        if shutil.which(name):
            return name
    return None


def have_pillow():
    try:
        import PIL.Image  # noqa: F401

        return True
    except ImportError:
        return False


def cover_crop(im, width, height):
    """Center-crop to the target aspect ratio, then resize (cover)."""
    from PIL import Image

    src_w, src_h = im.size
    if src_w <= 0 or src_h <= 0:
        raise ValueError("empty image")
    target_ratio = width / float(height)
    src_ratio = src_w / float(src_h)
    if src_ratio > target_ratio:
        crop_w = int(round(src_h * target_ratio))
        crop_h = src_h
    else:
        crop_w = src_w
        crop_h = int(round(src_w / target_ratio))
    left = (src_w - crop_w) // 2
    top = (src_h - crop_h) // 2
    im = im.crop((left, top, left + crop_w, top + crop_h))
    return im.resize((width, height), Image.LANCZOS)


def render_with_pillow(master, rel_path, width, height):
    from PIL import Image

    dest = os.path.join(ROOT, rel_path)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with Image.open(master) as im:
        rgba = im.convert("RGBA")
        out = cover_crop(rgba, width, height)
        has_alpha = rgba.getchannel("A").getextrema()[0] < 255
        if has_alpha:
            # Keep transparency (stock icons are transparent PNGs).
            out.save(dest, "PNG", optimize=True)
        else:
            # 256-colour palette with dithering keeps photos small in the ELF.
            out = out.convert("RGB").convert("P", palette=Image.ADAPTIVE, colors=256)
            out.save(dest, "PNG", optimize=True)
    return dest


def ico_with_pillow(master):
    from PIL import Image

    with Image.open(master) as im:
        square = cover_crop(im.convert("RGB"), 256, 256)
        square.save(ICO_PATH, format="ICO", sizes=[(s, s) for s in ICO_SIZES])
    return ICO_PATH


def source_has_alpha(master):
    """True when the source PNG carries transparency (ImageMagick probe)."""
    try:
        out = subprocess.run(
            [magick_command(), "identify", "-format", "%[opaque]", master + "[0]"],
            check=True, capture_output=True, text=True)
        return out.stdout.strip().lower() == "false"
    except Exception:
        return False


def render_with_magick(master, rel_path, width, height):
    dest = os.path.join(ROOT, rel_path)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if source_has_alpha(master):
        # Preserve transparency; palette PNG8 would flatten it.
        spec = "PNG32:" + dest
        extra = ["-depth", "8"]
    else:
        spec = "PNG8:" + dest
        extra = ["-dither", "FloydSteinberg", "-colors", "256", "-depth", "8"]
    subprocess.run(
        [magick_command(), master + "[0]", "-auto-orient", "-strip",
         "-background", "none",
         "-resize", f"{width}x{height}^",
         "-gravity", "center", "-extent", f"{width}x{height}"]
        + extra +
        ["-define", "png:compression-level=9", spec],
        check=True,
        capture_output=True,
    )
    return dest


def ico_with_magick(master):
    sizes = ",".join(str(s) for s in ICO_SIZES)
    subprocess.run(
        [magick_command(), master + "[0]", "-auto-orient", "-strip",
         "-background", "none",
         "-resize", "256x256^", "-gravity", "center", "-extent", "256x256",
         "-define", f"icon:auto-resize={sizes}", ICO_PATH],
        check=True,
        capture_output=True,
    )
    return ICO_PATH


def import_image(source, dest):
    """Copy a picture to a master path (converting to PNG)."""
    source = os.path.abspath(source)
    if not os.path.isfile(source):
        sys.exit(f"Error: picture not found: {source}")
    if os.path.abspath(dest) == source:
        return
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if have_pillow():
        from PIL import Image

        with Image.open(source) as im:
            im.convert("RGB").save(dest, "PNG", optimize=True)
    else:
        tool = magick_command()
        if not tool:
            sys.exit("Error: need Pillow or ImageMagick to import a picture.")
        subprocess.run(
            [tool, source + "[0]", "-auto-orient", "-strip",
             "-depth", "8", "-define", "png:compression-level=9", dest],
            check=True,
            capture_output=True,
        )
    print(f"Master: {os.path.relpath(dest, ROOT)} (from {source})")


def import_photo(source):
    """Copy the user's picture into assets/home-photo.png."""
    import_image(source, MASTER)


def build_placeholder():
    """Re-render the default master art from assets/home-photo.svg."""
    svg = os.path.join(ROOT, "assets", "home-photo.svg")
    render_svg(svg, MASTER, 1920, 1080)
    print(f"Rebuilt placeholder master: {os.path.relpath(MASTER, ROOT)}")


def build_stock_bg():
    """Render the neutral PS-blue hover background from assets/store-bg.svg."""
    svg = os.path.join(ROOT, "assets", "store-bg.svg")
    render_svg(svg, BG_MASTER, 1920, 1080)
    print(f"Stock background: {os.path.relpath(BG_MASTER, ROOT)}")


def render_svg(svg, dest, width, height):
    rsvg = shutil.which("rsvg-convert")
    if not rsvg:
        sys.exit("Error: rsvg-convert not found (needed for SVG sources).")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "wb") as f:
        f.write(subprocess.run([rsvg, "-w", str(width), "-h", str(height), svg],
                               check=True, capture_output=True).stdout)


def main(argv=None):
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--photo", default=None,
                        help="Picture to use as the single master (any format).")
    parser.add_argument("--icon", default=None,
                        help="Picture to use as the tile icon / logo master.")
    parser.add_argument("--bg", default=None,
                        help="Picture to use as the hover/focus background master.")
    parser.add_argument("--placeholder", action="store_true",
                        help="Rebuild assets/home-photo.png from assets/home-photo.svg.")
    parser.add_argument("--stock-bg", action="store_true",
                        help="Rebuild the neutral background from assets/store-bg.svg.")
    args = parser.parse_args(argv)

    if args.placeholder:
        build_placeholder()
    if args.stock_bg:
        build_stock_bg()
    if args.photo:
        import_photo(args.photo)
    if args.icon:
        import_image(args.icon, ICON_MASTER)
    if args.bg:
        import_image(args.bg, BG_MASTER)

    have_split = os.path.isfile(ICON_MASTER) and os.path.isfile(BG_MASTER)
    if not os.path.isfile(MASTER) and not have_split:
        sys.exit(
            f"Error: {os.path.relpath(MASTER, ROOT)} is missing.\n"
            "  Add your picture:  make photo PHOTO=/path/to/picture.jpg\n"
            "  or use separate masters:  make icon PHOTO=... / make background PHOTO=..."
        )

    use_pillow = have_pillow()
    if not use_pillow and not magick_command():
        sys.exit("Error: need Pillow or ImageMagick to generate the images.")

    for rel_path, width, height, kind in OUTPUTS:
        src = master_path(kind)
        if use_pillow:
            dest = render_with_pillow(src, rel_path, width, height)
        else:
            dest = render_with_magick(src, rel_path, width, height)
        print(f"  {rel_path} ({width}x{height}, {os.path.getsize(dest)} bytes, {kind})")

    icon_src = master_path("icon")
    ico = ico_with_pillow(icon_src) if use_pillow else ico_with_magick(icon_src)
    print(f"  {os.path.relpath(ico, ROOT)} ({len(ICO_SIZES)} sizes)")
    print(f"Generated {len(OUTPUTS) + 1} images.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

