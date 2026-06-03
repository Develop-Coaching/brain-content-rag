"""Build a 9:16 Reel cover thumbnail for the Cost Tracker Pro announcement.

Brand style mirrors summit-thumbnail-watch-this.jpg: yellow Impact hook with
thick black outline, yellow eyebrow pill, dark gradient scrim, white sub-hook.
Base frame uses the most expressive direct-to-camera moment from the video.
"""
from __future__ import annotations
import subprocess
import tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FF = "/Users/chloewilkes/Library/CloudStorage/GoogleDrive-chloe.developcoaching@gmail.com/My Drive/Claude Code/Develop Coaching/Marketing/The Oracle/bin/ffmpeg"
V  = "/Users/chloewilkes/Library/CloudStorage/GoogleDrive-chloe.developcoaching@gmail.com/My Drive/Claude Code/Develop Coaching/Marketing/Videos/Reels/To Edit/2026-06-03/copy_4F9BC9A5-42D1-4901-93C7-1601D94B9C86.mov"
OUT = Path("/Users/chloewilkes/Library/CloudStorage/GoogleDrive-chloe.developcoaching@gmail.com/My Drive/Claude Code/Develop Coaching/Marketing/Videos/Reels/To Edit/2026-06-03/thumbnail.jpg")

W, H = 1080, 1920
FRAME_TIME = "38"  # strong direct-to-camera shot

GOLD       = (253, 206, 54)
GOLD_DARK  = (249, 169, 52)
WHITE      = (245, 245, 245)
INK        = (15, 14, 16)
RED        = (230, 57, 70)

IMPACT  = "/System/Library/Fonts/Supplemental/Impact.ttf"
ARIAL_B = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def grab_frame() -> Image.Image:
    """Grab a face-tight crop and place it in the lower 60% of the canvas.

    Source is 720x1280. Burned-in subtitle sits roughly y=720-870 (chest band).
    Crop the face region only (y=280-720 = 440px tall), upscale, and place at
    the bottom of the canvas so the top ~720px stays pure dark for the hook.
    """
    with tempfile.TemporaryDirectory() as td:
        raw = Path(td) / "frame.png"
        subprocess.run([
            FF, "-y", "-loglevel", "error",
            "-ss", FRAME_TIME, "-i", V,
            "-frames:v", "1",
            # crop the face band (720x640 from y=80 — strictly above the subtitle
            # which starts ~y=750), then upscale to 1080x960 face panel
            "-vf", "crop=720:640:0:80,scale=1080:960",
            str(raw),
        ], check=True)
        face = Image.open(raw).convert("RGB")

        canvas = Image.new("RGB", (W, H), (12, 12, 14))
        face_top = H - face.height  # bleed face to bottom edge
        canvas.paste(face, (0, face_top))

        # Soft top edge on the face panel so it blends into the dark hook zone.
        fade_h = 140
        fpx = face.load()
        cpx = canvas.load()
        for y in range(fade_h):
            t = y / fade_h
            for x in range(W):
                r0, g0, b0 = fpx[x, y]
                # blend face row toward the dark canvas colour
                r = int(12 * (1 - t) + r0 * t)
                g = int(12 * (1 - t) + g0 * t)
                b = int(14 * (1 - t) + b0 * t)
                cpx[x, face_top + y] = (r, g, b)
        return canvas


def draw_outlined(draw, xy, text, font, fill, stroke=(0, 0, 0), stroke_w=8):
    x, y = xy
    r2 = stroke_w * stroke_w
    for dx in range(-stroke_w, stroke_w + 1):
        for dy in range(-stroke_w, stroke_w + 1):
            if dx * dx + dy * dy <= r2:
                draw.text((x + dx, y + dy), text, font=font, fill=stroke)
    draw.text((x, y), text, font=font, fill=fill)


def main():
    bg = grab_frame()

    # The canvas already has a dark hook zone above the face panel — no scrim needed.
    bg = bg.convert("RGBA")

    draw = ImageDraw.Draw(bg)

    # IG Reel safe zones: ~120px top, ~280px bottom, ~100px sides will be
    # covered by UI / cropped. Keep all text inside that box.
    LEFT = 120

    # ---- Eyebrow pill: "JUST LAUNCHED" -----------------------------------
    eyebrow_font = ImageFont.truetype(ARIAL_B, 42)
    eyebrow_text = "JUST LAUNCHED"
    eb = draw.textbbox((0, 0), eyebrow_text, font=eyebrow_font)
    ew, eh = eb[2] - eb[0], eb[3] - eb[1]
    pad_x, pad_y = 28, 12
    ex, ey = LEFT, 220
    draw.rounded_rectangle(
        [ex - pad_x, ey - pad_y, ex + ew + pad_x, ey + eh + pad_y + 6],
        radius=10, fill=GOLD,
    )
    draw.text((ex, ey), eyebrow_text, font=eyebrow_font, fill=INK)

    # ---- Hero hook: "ONE APP" / "DOES IT ALL" over the dark hook zone ----
    hook_font = ImageFont.truetype(IMPACT, 190)
    line1 = "ONE APP"
    line2 = "DOES IT ALL"
    y1 = 340
    y2 = y1 + 195
    draw_outlined(draw, (LEFT, y1), line1, hook_font, GOLD, stroke=INK, stroke_w=8)
    draw_outlined(draw, (LEFT, y2), line2, hook_font, GOLD, stroke=INK, stroke_w=8)

    # ---- Sub-hook: white, sits just under the hero, above the face -------
    sub_font = ImageFont.truetype(IMPACT, 72)
    sub_line = "BUILT FOR BUILDERS"
    draw_outlined(draw, (LEFT, y2 + 200), sub_line, sub_font, WHITE, stroke=INK, stroke_w=6)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    bg.convert("RGB").save(OUT, "JPEG", quality=92)
    print(f"Saved: {OUT} ({bg.size})")


if __name__ == "__main__":
    main()
