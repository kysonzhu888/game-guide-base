#!/usr/bin/env python3
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
PROMO = ROOT / "promo"
TMP = PROMO / ".tmp"
OUTPUT = PROMO / "output"
AUDIO = PROMO / "audio" / "kokoro-lipsync"

BASE_VIDEO = OUTPUT / "game-guide-base-tiktok-hook-v2.mp4"
FINAL_AUDIO = AUDIO / "final-lipsync-audio.wav"
PRESENTER = PROMO / "assets" / "presenter.png"
OUT_VIDEO = OUTPUT / "game-guide-base-tiktok-hook-v2-wav2lip-mouthpatch.mp4"

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

    # Keep the mouth/chin area, avoid importing Wav2Lip's blur into the nose and eyes.
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
        frame_dir = TMP / f"wav2lip_{key}_frames"
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


def active_presenter(t: float) -> tuple[list[Image.Image], int, tuple[int, int], bool] | None:
    for key, start, end, position, flip in SPEECH_WINDOWS:
        if start <= t <= end:
            frames = PRESENTER_FRAMES[key]
            index = min(len(frames) - 1, max(0, round((t - start) * FPS)))
            return frames, index, position, flip
    return None


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
    global PRESENTER_FRAMES
    PRESENTER_FRAMES = build_presenter_frames()

    raw_dir = TMP / "wav2lip_base_frames"
    out_dir = TMP / "wav2lip_mouthpatch_frames"
    extract_frames(BASE_VIDEO, raw_dir, FPS)
    shutil.rmtree(out_dir, ignore_errors=True)
    out_dir.mkdir(parents=True, exist_ok=True)

    for i, frame_path in enumerate(sorted(raw_dir.glob("frame_*.png"))):
        t = i / FPS
        frame = Image.open(frame_path).convert("RGBA")
        active = active_presenter(t)
        if active:
            frames, index, position, flip = active
            presenter = frames[index]
            if flip:
                presenter = presenter.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            paste_rgba(frame, presenter, position[0], position[1])
        frame.convert("RGB").save(out_dir / frame_path.name)

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
