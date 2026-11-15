#!/usr/bin/env python3
"""
Al-share PWA icon generator.

Pure Python 3 (zlib + struct) so the project keeps its zero-dependency promise.
Run:  python3 tools/make_icons.py
Outputs PNG icons into web/icons/.
"""

import os
import struct
import zlib

ACCENT = (255, 217, 61, 255)   # --accent
INK = (10, 10, 10, 255)        # --ink
CLEAR = (0, 0, 0, 0)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "..", "web", "icons")

# Lightning bolt, normalised to its bounding box (x, y).
BOLT = (
    (0.55, 0.10),
    (0.24, 0.57),
    (0.46, 0.57),
    (0.38, 0.91),
    (0.75, 0.43),
    (0.53, 0.43),
)


def in_rounded_rect(x, y, x0, y0, x1, y1, r):
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    cx = x0 + r if x < x0 + r else (x1 - r if x > x1 - r else x)
    cy = y0 + r if y < y0 + r else (y1 - r if y > y1 - r else y)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def in_polygon(points, x, y):
    inside = False
    n = len(points)
    j = n - 1
    for i in range(n):
        xi, yi = points[i]
        xj, yj = points[j]
        if (yi > y) != (yj > y):
            if x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                inside = not inside
        j = i
    return inside


def bolt_points(x0, y0, x1, y1):
    w = x1 - x0
    h = y1 - y0
    return tuple((x0 + px * w, y0 + py * h) for px, py in BOLT)


def color_at(x, y, maskable):
    """Return RGBA for a normalised (0..1) coordinate."""
    if maskable:
        # Full-bleed accent background; artwork kept inside the 80% safe zone.
        if in_rounded_rect(x, y, 0.28, 0.28, 0.72, 0.72, 0.09):
            if in_polygon(bolt_points(0.28, 0.28, 0.72, 0.72), x, y):
                return ACCENT
            return INK
        return ACCENT

    if not in_rounded_rect(x, y, 0.02, 0.02, 0.98, 0.98, 0.22):
        return CLEAR
    if not in_rounded_rect(x, y, 0.065, 0.065, 0.935, 0.935, 0.19):
        return INK
    if in_rounded_rect(x, y, 0.20, 0.20, 0.80, 0.80, 0.125):
        if in_polygon(bolt_points(0.20, 0.20, 0.80, 0.80), x, y):
            return ACCENT
        return INK
    return ACCENT


def render(size, maskable=False, ss=2):
    """Render an RGBA bitmap with ss x ss supersampling per pixel."""
    total = size * ss
    px = bytearray(size * size * 4)
    inv = 1.0 / total
    samples = ss * ss
    for y in range(size):
        for x in range(size):
            r = g = b = a = 0
            for sy in range(ss):
                for sx in range(ss):
                    cr, cg, cb, ca = color_at(
                        (x * ss + sx + 0.5) * inv,
                        (y * ss + sy + 0.5) * inv,
                        maskable,
                    )
                    if ca:
                        r += cr
                        g += cg
                        b += cb
                        a += ca
            i = (y * size + x) * 4
            if a:
                # Un-premultiply the covered area so edges stay crisp and clean.
                px[i] = r // samples
                px[i + 1] = g // samples
                px[i + 2] = b // samples
                px[i + 3] = a // samples
    return px


def resize(src, sw, sh, dw, dh):
    """Box-filter downscale of an RGBA bitmap."""
    dst = bytearray(dw * dh * 4)
    x_ratio = sw / dw
    y_ratio = sh / dh
    for dy in range(dh):
        sy0 = dy * y_ratio
        sy1 = sy0 + y_ratio
        for dx in range(dw):
            sx0 = dx * x_ratio
            sx1 = sx0 + x_ratio
            rs = gs = bs = as_ = area = 0.0
            y = int(sy0)
            while y < sy1 and y < sh:
                wy = min(sy1, y + 1) - max(sy0, y)
                x = int(sx0)
                while x < sx1 and x < sw:
                    wx = min(sx1, x + 1) - max(sx0, x)
                    w = wx * wy
                    i = (y * sw + x) * 4
                    rs += src[i] * w
                    gs += src[i + 1] * w
                    bs += src[i + 2] * w
                    as_ += src[i + 3] * w
                    area += w
                    x += 1
                y += 1
            o = (dy * dw + dx) * 4
            if area:
                dst[o] = int(rs / area + 0.5)
                dst[o + 1] = int(gs / area + 0.5)
                dst[o + 2] = int(bs / area + 0.5)
                dst[o + 3] = int(as_ / area + 0.5)
    return dst


def write_png(path, w, h, px):
    raw = bytearray()
    stride = w * 4
    for y in range(h):
        raw.append(0)
        raw += px[y * stride:(y + 1) * stride]
    comp = zlib.compress(bytes(raw), 9)

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", comp))
        f.write(chunk(b"IEND", b""))


def write_svg(path):
    pts = " ".join(
        f"{x0 + px * (x1 - x0):.1f},{y0 + py * (y1 - y0):.1f}"
        for px, py in BOLT
        for x0, y0, x1, y1 in ((20, 20, 80, 80),)
    )
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <rect x="2" y="2" width="96" height="96" rx="22" fill="#ffd93d"/>
  <rect x="6.5" y="6.5" width="87" height="87" rx="19" fill="none" stroke="#0a0a0a" stroke-width="9"/>
  <rect x="20" y="20" width="60" height="60" rx="12.5" fill="#0a0a0a"/>
  <polygon points="{pts}" fill="#ffd93d"/>
</svg>
"""
    with open(path, "w", encoding="utf-8") as f:
        f.write(svg)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    print("Rendering 512x512 master icon...")
    master = render(512)
    write_png(os.path.join(OUT_DIR, "icon-512.png"), 512, 512, master)

    print("Rendering maskable / apple touch icon...")
    maskable = render(512, maskable=True)
    write_png(os.path.join(OUT_DIR, "icon-maskable-512.png"), 512, 512, maskable)

    print("Resizing 192 / 180 / 32 variants...")
    for size, name in ((192, "icon-192.png"), (180, "apple-touch-icon.png"), (32, "favicon-32.png")):
        write_png(os.path.join(OUT_DIR, name), size, size, resize(master, 512, 512, size, size))

    write_svg(os.path.join(OUT_DIR, "icon.svg"))
    print(f"Icons written to {os.path.normpath(OUT_DIR)}")


if __name__ == "__main__":
    main()
