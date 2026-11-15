"""Builds the Calzone product demo video (1920x1080, about 2 minutes) with captions.

Inputs (all in submission_hellovitals/):
  video/vo/sNN.mp3          AI voice clips (ElevenLabs), one per scene of video/script.md
  video/slides/slideNN.png  the deck's slides, rendered
  assets/screens/*.mp4/png  real recordings and screenshots of the app (iPhone simulator, Mac page)
Outputs: video/Calzone_Product_Demo.mp4 and .srt
Run: python3 tools/build_video.py   (needs ffmpeg and Pillow)
"""
import json, re, subprocess, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
V = ROOT / "video"
WORK = V / "_work"
WORK.mkdir(exist_ok=True)
SCREENS = ROOT / "assets" / "screens"
W, H, FPS = 1920, 1080, 30
NAVY = (11, 16, 32)
GAP = 0.7  # seconds of quiet after each line
SANS = "/System/Library/Fonts/Supplemental/Arial.ttf"
SANS_B = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
SERIF_B = "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"


def sh(*cmd):
    r = subprocess.run([str(c) for c in cmd], capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"failed: {' '.join(map(str, cmd))}\n{r.stderr[-1500:]}")
    return r.stdout


def duration(f):
    return float(sh("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f))


def wrap(draw, text, font, width):
    lines, line = [], ""
    for word in text.split():
        test = (line + " " + word).strip()
        if draw.textlength(test, font=font) <= width:
            line = test
        else:
            lines.append(line); line = word
    return lines + [line]


def caption_png(text, out):
    """A caption bar: white text on a dark band, at the bottom of the frame."""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(SANS, 40)
    lines = wrap(d, text, f, 1500)
    lh = 52
    top = H - 70 - lh * len(lines)
    d.rounded_rectangle([W / 2 - 800, top - 22, W / 2 + 800, H - 48], 18, fill=(5, 8, 18, 215))
    for i, l in enumerate(lines):
        d.text((W / 2, top + i * lh), l, font=f, fill=(242, 245, 251, 255), anchor="ma")
    img.save(out)


def badge_png(out):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(SANS_B, 26)
    d.rounded_rectangle([W - 210, 30, W - 34, 76], 12, fill=(5, 8, 18, 200), outline=(77, 184, 255, 255), width=2)
    d.text((W - 122, 53), "AI voice", font=f, fill=(77, 184, 255, 255), anchor="mm")
    img.save(out)


def phone_background(step, title, body, out):
    """Left side text for the phone scenes; the phone video sits on the right."""
    img = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(img)
    d.text((140, 250), step.upper(), font=ImageFont.truetype(SANS_B, 30), fill=(255, 107, 74))
    tf = ImageFont.truetype(SERIF_B, 76)
    y = 310
    for l in wrap(d, title, tf, 1000):
        d.text((140, y), l, font=tf, fill=(242, 245, 251)); y += 92
    bf = ImageFont.truetype(SANS, 38)
    y += 30
    for l in wrap(d, body, bf, 980):
        d.text((140, y), l, font=bf, fill=(154, 166, 189)); y += 52
    d.text((140, 170), "Real app, recorded in the iPhone simulator connected to our Mac", font=ImageFont.truetype(SANS, 24), fill=(110, 122, 148))
    img.save(out)


# Scenes: (id, kind, source, extra)
#   slide: a slide image, slowly zoomed
#   phone: clips [(start, end), ...] from a recording, fitted to the scene length
#   still: an image panned top to bottom
SCENES = [
    ("s01", "slide", "slide01.png", None),
    ("s02", "slide", "slide02.png", None),
    ("s03", "phone", "phone_calzone_raw.mp4", {"clips": [(0.0, 2.4), (12.0, 19.6)], "step": "Step 1 · Take a picture", "title": "Glasses, camera, or upload", "body": "Pick up to 5 photos of your food."}),
    ("s04", "phone", "phone_calzone_raw.mp4", {"clips": [(21.5, 30.0)], "step": "Step 2 · The AI looks", "title": "7 foods in 6 seconds", "body": "The AI names each food and guesses how much there is."}),
    ("s05", "phone", "phone_calzone_raw.mp4", {"clips": [(35.0, 50.0)], "step": "Step 3 · You check", "title": "Fix the AI's mistakes", "body": "It said \"chicken curry.\" It was really a cheese curry. Pick the right food."}),
    ("s06", "phone", "phone_calzone_raw.mp4", {"clips": [(54.0, 66.5)], "step": "Step 4 · Real numbers", "title": "What you need on Earth and in space", "body": "Blue bar: how much you need. Orange bar: close to a limit."}),
    ("s07", "phone", "phone_calzone_raw.mp4", {"clips": [(66.5, 75.0)], "step": "Example · Iron", "title": "Fine on Earth, a lot in space", "body": "In space, extra iron can build up in the body. So NASA sets a limit."}),
    ("s08", "phone", "phone_today_raw.mp4", {"clips": [(0.0, 6.7)], "step": "Step 5 · Your day", "title": "Add up your whole day", "body": "The phone and the computer share one list."}),
    ("s09", "still", "mac_calzone_top.png", {"then": "mac_calzone_table.png"}),
    ("s10", "slide", "slide03.png", None),
    ("s11", "slide", "slide07.png", None),
]


def script_lines():
    lines = {}
    for l in (V / "script.md").read_text().splitlines():
        if re.match(r"\| s\d\d \|", l):
            c = [x.strip() for x in l.strip().strip("|").split("|")]
            lines[c[0]] = c[3]
    return lines


def chunks(text):
    """Split narration into caption-sized pieces at sentence or comma breaks."""
    parts = re.split(r"(?<!U\.S\.)(?<=[.!?:])\s+", text)
    out = []
    for p in parts:
        if len(p) <= 95:
            out.append(p); continue
        bits, cur = re.split(r"(?<=,)\s+", p), ""
        for b in bits:
            if cur and len(cur) + len(b) > 95:
                out.append(cur); cur = b
            else:
                cur = (cur + " " + b).strip()
        out.append(cur)
    return [o for o in out if o]


def main():
    text = script_lines()
    badge = WORK / "badge.png"; badge_png(badge)
    segs, srt, t0, n = [], [], 0.0, 0
    for sid, kind, src, extra in SCENES:
        vo = V / "vo" / f"{sid}.mp3"
        vod = duration(vo)
        dur = round(vod + GAP, 3)
        # captions: split the line by length, timed across the voice clip
        pieces = chunks(re.sub(r"A\.I\.(?=\s+[A-Z])", "AI.", text[sid]).replace("A.I.", "AI"))  # voice reads "A.I."; captions show "AI"
        total = sum(len(p) for p in pieces)
        caps, at = [], 0.0
        for i, p in enumerate(pieces):
            span = vod * len(p) / total
            png = WORK / f"{sid}_cap{i}.png"; caption_png(p, png)
            caps.append((png, at, at + span))
            n += 1
            srt.append(f"{n}\n{ts(t0 + at)} --> {ts(t0 + at + span)}\n{p}\n")
            at += span
        # the picture
        base = WORK / f"{sid}_base.mp4"
        if kind == "slide":
            img = V / "slides" / src
            sh("ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-i", img, "-t", dur,
               "-vf", f"scale={W}:{H},zoompan=z='min(zoom+0.0004,1.04)':d={int(dur * FPS) + 1}:s={W}x{H}:fps={FPS},format=yuv420p",
               "-r", FPS, base)
        elif kind == "phone":
            bg = WORK / f"{sid}_bg.png"; phone_background(extra["step"], extra["title"], extra["body"], bg)
            raw = SCREENS / src
            parts = []
            for j, (a, b) in enumerate(extra["clips"]):
                pj = WORK / f"{sid}_part{j}.mp4"
                sh("ffmpeg", "-y", "-loglevel", "error", "-ss", a, "-to", b, "-i", raw, "-an", "-vf", f"fps={FPS},scale=-2:960", "-c:v", "libx264", "-pix_fmt", "yuv420p", pj)
                parts.append(pj)
            joined = WORK / f"{sid}_joined.mp4"
            lst = WORK / f"{sid}_list.txt"; lst.write_text("".join(f"file '{p}'\n" for p in parts))
            sh("ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", joined)
            speed = duration(joined) / dur  # fit the footage to the narration
            sh("ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-i", bg, "-i", joined, "-t", dur, "-filter_complex",
               f"[1:v]setpts=PTS/{speed:.4f},scale=-2:960,pad=iw+16:ih+16:8:8:color=0x3A4670[ph];[0:v][ph]overlay=x=W-w-150:y=(H-h)/2:shortest=0,format=yuv420p",
               "-r", FPS, base)
        else:  # still pan: Mac page, top then the nutrient table
            a = SCREENS / src; b = SCREENS / extra["then"]
            half = dur / 2
            pa, pb = WORK / f"{sid}_a.mp4", WORK / f"{sid}_b.mp4"
            for img, out, d in ((a, pa, half), (b, pb, dur - half)):
                sh("ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-i", img, "-t", d, "-vf",
                   f"scale={W}:-2,crop={W}:{H}:0:'min(ih-{H},(ih-{H})*t/{d:.3f})',format=yuv420p" if Image.open(img).height * W / Image.open(img).width > H
                   else f"scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=0x0B1020,format=yuv420p",
                   "-r", FPS, out)
            lst = WORK / f"{sid}_list.txt"; lst.write_text(f"file '{pa}'\nfile '{pb}'\n")
            sh("ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", base)
        # overlays (AI voice badge + captions) and the voice
        inputs = ["-i", base, "-i", vo, "-loop", "1", "-i", badge]
        chain, last = "[0:v][2:v]overlay=0:0[v0]", "v0"
        for k, (png, a, b) in enumerate(caps):
            inputs += ["-loop", "1", "-i", png]
            chain += f";[{last}][{k + 3}:v]overlay=0:0:enable='between(t,{a:.2f},{b:.2f})'[v{k + 1}]"
            last = f"v{k + 1}"
        seg = WORK / f"{sid}_seg.mp4"
        sh("ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", chain + f";[1:a]apad,atrim=0:{dur},aresample=48000[a]",
           "-map", f"[{last}]", "-map", "[a]", "-t", dur, "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2", seg)
        segs.append(seg)
        print(sid, f"{dur:.1f}s")
        t0 += dur
    lst = WORK / "all.txt"; lst.write_text("".join(f"file '{s}'\n" for s in segs))
    out = V / "Calzone_Product_Demo.mp4"
    sh("ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", "-movflags", "+faststart", out)
    (V / "Calzone_Product_Demo.srt").write_text("\n".join(srt))
    print("wrote", out, f"{duration(out):.1f}s")


def ts(t):
    h, rem = divmod(t, 3600); m, s = divmod(rem, 60)
    return f"{int(h):02d}:{int(m):02d}:{int(s):02d},{int(round((s % 1) * 1000)):03d}"


if __name__ == "__main__":
    main()
