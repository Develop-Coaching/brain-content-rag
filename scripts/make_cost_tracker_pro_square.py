"""1080x1080 square cover for LinkedIn / X — same brand language as the
9:16 Reel thumbnail, reformatted for feed posts."""
from __future__ import annotations
import subprocess
import tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

FF = "/Users/chloewilkes/Library/CloudStorage/GoogleDrive-chloe.developcoaching@gmail.com/My Drive/Claude Code/Develop Coaching/Marketing/The Oracle/bin/ffmpeg"
V  = "/Users/chloewilkes/Library/CloudStorage/GoogleDrive-chloe.developcoaching@gmail.com/My Drive/Claude Code/Develop Coaching/Marketing/Videos/Reels/To Edit/2026-06-03/copy_4F9BC9A5-42D1-4901-93C7-1601D94B9C86.mov"
OUT = Path("/Users/chloewilkes/Library/CloudStorage/GoogleDrive-chloe.developcoaching@gmail.com/My Drive/Claude Code/Develop Coaching/Marketing/Videos/Reels/To Edit/2026-06-03/thumbnail-square.jpg")

W, H = 1080, 1080
FRAME_TIME = "38"

GOLD = (253, 206, 54)
WHITE = (245, 245, 245)
INK = (15, 14, 16)
IMPACT = "/System/Library/Fonts/Supplemental/Impact.ttf"
ARIAL_B = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def grab_face() -> Image.Image:
    """Crop a 720x360 band (2:1) from the source so it scales to 1080x540
    without any horizontal/vertical distortion."""
    with tempfile.TemporaryDirectory() as td:
        raw = Path(td) / "frame.png"
        subprocess.run([
            FF, "-y", "-loglevel", "error",
            "-ss", FRAME_TIME, "-i", V,
            "-frames:v", "1",
            # source 720x360 from y=260 (forehead-to-chest), exact 2:1 ratio
            "-vf", "crop=720:360:0:260,scale=1080:540",
            str(raw),
        ], check=True)
        return Image.open(raw).convert("RGB")


def draw_outlined(draw, xy, text, font, fill, stroke=INK, stroke_w=7):
    x, y = xy
    r2 = stroke_w * stroke_w
    for dx in range(-stroke_w, stroke_w + 1):
        for dy in range(-stroke_w, stroke_w + 1):
            if dx * dx + dy * dy <= r2:
                draw.text((x + dx, y + dy), text, font=font, fill=stroke)
    draw.text((x, y), text, font=font, fill=fill)


def main():
    face = grab_face()
    canvas = Image.new("RGB", (W, H), (12, 12, 14))
    face_top = H - face.height
    canvas.paste(face, (0, face_top))

    # soft top edge on face
    fade_h = 90
    fpx = face.load()
    cpx = canvas.load()
    for y in range(fade_h):
        t = y / fade_h
        for x in range(W):
            r0, g0, b0 = fpx[x, y]
            cpx[x, face_top + y] = (
                int(12 * (1 - t) + r0 * t),
                int(12 * (1 - t) + g0 * t),
                int(14 * (1 - t) + b0 * t),
            )

    draw = ImageDraw.Draw(canvas)
    LEFT = 80

    # pill
    pill_f = ImageFont.truetype(ARIAL_B, 36)
    pill_text = "JUST LAUNCHED"
    pb = draw.textbbox((0, 0), pill_text, font=pill_f)
    pw, ph = pb[2] - pb[0], pb[3] - pb[1]
    px, py = LEFT, 70
    draw.rounded_rectangle(
        [px - 24, py - 10, px + pw + 24, py + ph + 16],
        radius=9, fill=GOLD,
    )
    draw.text((px, py), pill_text, font=pill_f, fill=INK)

    # hero hook
    hook_f = ImageFont.truetype(IMPACT, 150)
    y1 = 160
    y2 = y1 + 150
    draw_outlined(draw, (LEFT, y1), "ONE APP", hook_f, GOLD)
    draw_outlined(draw, (LEFT, y2), "DOES IT ALL", hook_f, GOLD)

    # sub
    sub_f = ImageFont.truetype(IMPACT, 56)
    draw_outlined(draw, (LEFT, y2 + 158), "BUILT FOR BUILDERS", sub_f, WHITE, stroke_w=5)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUT, "JPEG", quality=92)
    print(f"Saved: {OUT} ({canvas.size})")


if __name__ == "__main__":
    main()
