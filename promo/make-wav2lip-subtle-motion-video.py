#!/usr/bin/env python3
from __future__ import annotations

import math
import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
PROMO = ROOT / "promo"
TMP = PROMO / ".tmp"
OUTPUT = PROMO / "output"
AUDIO = PROMO / "audio" / "kokoro-lipsync"

NO_PRESENTER_SLIDES = Path("/tmp/ggb-no-presenter-slides")
FINAL_AUDIO = AUDIO / "final-lipsync-audio.wav"
PRESENTER = PROMO / "assets" / "presenter.png"
OUT_VIDEO = OUTPUT / "game-guide-base-tiktok-hook-v2-wav2lip-subtle-motion.mp4"

WAV2LIP_DIR = Path("/tmp/ggb-wav2lip/presenter")
WAV2LIP_VIDEOS = {
    "phrase0": WAV2LIP_DIR / "phrase0_presenter.mp4",
    "phrase1": WAV2LIP_DIR / "phrase1_presenter.mp4",
    "phrase2": WAV2LIP_DIR / "phrase2_presenter.mp4",
}

FPS = 30
DURATION = 17.05
DISPLAY_W = 540
DISPLAY_H = 1138
RIGHT_POS = (612, 352)
LEFT_POS = (-92, 352)
MOUTH_BOX = (360, 492, 530, 612)

SLIDES = [
    ("slide0.png", 0.0, 3.6),
    ("slide1.png", 3.6, 7.0),
    ("slide2.png", 7.0, 10.2),
    ("slide3.png", 10.2, 13.4),
    ("slide4.png", 13.4, 17.05),
]

SPEECH_WINDOWS = [
    ("phrase0", 0.18, 2.83, RIGHT_POS, False),
    ("phrase1", 7.15, 10.13, LEFT_POS, True),
    ("phrase2", 13.68, 16.06, RIGHT_POS, False),
]


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True)


def extract_frames(video: Path, out_dir: Path, fps: int) -> None:
    shutil.rmtree(out_dir, ignore_errors=True)
    out_dir.mkdir(parents=True, exist_ok=True)
    run([
        "ffmpeg",
        "-y",
        "-i",
        str(video),
        "-vf",
        f"fps={fps}",
        str(out_dir / "frame_%04d.png"),
    ])


def make_mouth_mask(size: tuple[int, int]) -> Image.Image:
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size[0], size[1]), radius=42, fill=188)

    gate = Image.new("L", size, 0)
    gate_draw = ImageDraw.Draw(gate)
    gate_draw.rounded_rectangle((0, 18, size[0], size[1]), radius=38, fill=255)
    mask = Image.composite(mask, Image.new("L", size, 0), gate)
    return mask.filter(ImageFilter.GaussianBlur(12))


def build_presenter_frames() -> dict[str, list[Image.Image]]:
    original = Image.open(PRESENTER).convert("RGBA")
    mouth_mask = make_mouth_mask((MOUTH_BOX[2] - MOUTH_BOX[0], MOUTH_BOX[3] - MOUTH_BOX[1]))
    result: dict[str, list[Image.Image]] = {}

    for key, video in WAV2LIP_VIDEOS.items():
        frame_dir = TMP / f"subtle_wav2lip_{key}_frames"
        extract_frames(video, frame_dir, FPS)
        patched_frames: list[Image.Image] = []
        for frame_path in sorted(frame_dir.glob("frame_*.png")):
            generated = Image.open(frame_path).convert("RGBA").resize(original.size)
            patched = original.copy()
            patch = generated.crop(MOUTH_BOX)
            patched.paste(patch, MOUTH_BOX[:2], mouth_mask)
            patched_frames.append(patched.resize((DISPLAY_W, DISPLAY_H), Image.Resampling.LANCZOS))
        result[key] = patched_frames

    return result


def active_presenter(t: float) -> tuple[str, float, tuple[int, int], bool] | None:
    for key, start, end, position, flip in SPEECH_WINDOWS:
        if start <= t <= end:
            return key, t - start, position, flip
    return None


def slide_for_time(t: float) -> Image.Image:
    for filename, start, end in SLIDES:
        if start <= t < end:
            return SLIDE_IMAGES[filename].copy()
    return SLIDE_IMAGES["slide4.png"].copy()


def subtle_motion(presenter: Image.Image, t: float, flip: bool) -> tuple[Image.Image, int, int]:
    # Tiny, unsynchronized motion gives the static presenter a breathing feel without looking floaty.
    bob_y = math.sin(t * math.tau * 0.72) * 2.0
    sway_x = math.sin(t * math.tau * 0.47 + 0.8) * 1.5
    scale = 1.0 + math.sin(t * math.tau * 0.55 + 1.2) * 0.004
    angle = math.sin(t * math.tau * 0.38 + 0.4) * 0.45
    if flip:
        angle = -angle

    w = max(1, round(presenter.width * scale))
    h = max(1, round(presenter.height * scale))
    moved = presenter.resize((w, h), Image.Resampling.LANCZOS)
    moved = moved.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
    return moved, round(sway_x - (moved.width - presenter.width) / 2), round(bob_y - (moved.height - presenter.height) / 2)


def finger_wiggle(presenter: Image.Image, t: float, flip: bool) -> Image.Image:
    # Nudge only the raised fingertip area. Kept tiny because large local warps look cheap fast.
    out = presenter.copy()
    box = (32, 264, 174, 496) if not flip else (DISPLAY_W - 174, 264, DISPLAY_W - 32, 496)
    patch = out.crop(box)
    angle = math.sin(t * math.tau * 1.45 + 0.6) * (1.15 if not flip else -1.15)
    rotated = patch.rotate(angle, resample=Image.Resampling.BICUBIC, center=(patch.width * 0.64, patch.height * 0.76))
    mask = Image.new("L", patch.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((22, 0, patch.width - 10, patch.height - 10), fill=120)
    mask = mask.filter(ImageFilter.GaussianBlur(9))
    out.paste(rotated, box[:2], mask)
    return out


def paste_rgba(base: Image.Image, overlay: Image.Image, x: int, y: int) -> None:
    if x < 0 or y < 0 or x + overlay.width > base.width or y + overlay.height > base.height:
        left = max(0, -x)
        top = max(0, -y)
        right = min(overlay.width, base.width - x)
        bottom = min(overlay.height, base.height - y)
        if right <= left or bottom <= top:
            return
        cropped = overlay.crop((left, top, right, bottom))
        base.alpha_composite(cropped, (max(0, x), max(0, y)))
    else:
        base.alpha_composite(overlay, (x, y))


def main() -> None:
    global SLIDE_IMAGES, PRESENTER_FRAMES
    SLIDE_IMAGES = {p.name: Image.open(p).convert("RGBA") for p in sorted(NO_PRESENTER_SLIDES.glob("slide*.png"))}
    PRESENTER_FRAMES = build_presenter_frames()

    out_dir = TMP / "wav2lip_subtle_motion_frames"
    shutil.rmtree(out_dir, ignore_errors=True)
    out_dir.mkdir(parents=True, exist_ok=True)

    frame_count = round(DURATION * FPS)
    for i in range(frame_count):
        t = i / FPS
        frame = slide_for_time(t)
        active = active_presenter(t)
        if active:
            key, local_t, position, flip = active
            frames = PRESENTER_FRAMES[key]
            index = min(len(frames) - 1, max(0, round(local_t * FPS)))
            presenter = frames[index]
            if flip:
                presenter = presenter.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            presenter = finger_wiggle(presenter, local_t, flip)
            presenter, dx, dy = subtle_motion(presenter, local_t, flip)
            paste_rgba(frame, presenter, position[0] + dx, position[1] + dy)
        frame.convert("RGB").save(out_dir / f"frame_{i + 1:04d}.png")

    run([
        "ffmpeg",
        "-y",
        "-framerate",
        str(FPS),
        "-i",
        str(out_dir / "frame_%04d.png"),
        "-i",
        str(FINAL_AUDIO),
        "-t",
        str(DURATION),
        "-vf",
        "scale=1080:1920,format=yuv420p",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        str(OUT_VIDEO),
    ])
    print(OUT_VIDEO)


if __name__ == "__main__":
    main()
