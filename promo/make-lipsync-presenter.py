#!/usr/bin/env python3
from __future__ import annotations

import math
import shutil
import subprocess
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
PROMO = ROOT / "promo"
TMP = PROMO / ".tmp"
OUTPUT = PROMO / "output"
AUDIO = PROMO / "audio" / "kokoro-lipsync"

BASE_VIDEO = OUTPUT / "game-guide-base-tiktok-hook-v2.mp4"
VOICE_WAV = AUDIO / "aligned-voice.wav"
FINAL_AUDIO = AUDIO / "final-lipsync-audio.wav"
OUT_VIDEO = OUTPUT / "game-guide-base-tiktok-hook-v2-lipsync-kokoro.mp4"

FPS = 30
DURATION = 17.05
WIDTH = 1080
HEIGHT = 1920

# Timings match build-tiktok-short.sh:
# slide0 0.0-3.6, slide2 7.0-10.2, slide4 13.4-17.0.
PRESENTER_MOUTHS = [
    (0.12, 3.35, 888, 724, 1.0),
    (7.08, 10.08, 178, 724, 0.9),
    (13.58, 16.35, 888, 724, 1.0),
]


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True)


def load_voice_envelope() -> np.ndarray:
    with wave.open(str(VOICE_WAV), "rb") as wav:
        sample_rate = wav.getframerate()
        channels = wav.getnchannels()
        frames = wav.readframes(wav.getnframes())

    data = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
    if channels > 1:
        data = data.reshape(-1, channels).mean(axis=1)

    samples_per_frame = int(sample_rate / FPS)
    frame_count = int(math.ceil(DURATION * FPS))
    envelope = np.zeros(frame_count, dtype=np.float32)

    for i in range(frame_count):
        start = i * samples_per_frame
        end = min(len(data), start + samples_per_frame)
        if start >= len(data):
            break
        chunk = data[start:end]
        envelope[i] = float(np.sqrt(np.mean(chunk * chunk))) if len(chunk) else 0.0

    # Smooth enough to avoid flicker, but keep syllable movement.
    kernel = np.array([0.08, 0.16, 0.24, 0.24, 0.16, 0.08], dtype=np.float32)
    envelope = np.convolve(envelope, kernel, mode="same")
    loud = envelope[envelope > 0.006]
    if len(loud):
        lo = float(np.percentile(loud, 25))
        hi = float(np.percentile(loud, 92))
    else:
        lo, hi = 0.006, 0.04
    return np.clip((envelope - lo) / max(hi - lo, 0.001), 0.0, 1.0)


def mouth_for_time(t: float) -> tuple[int, int, float] | None:
    for start, end, x, y, scale in PRESENTER_MOUTHS:
        if start <= t <= end:
            return x, y, scale
    return None


def draw_mouth(frame: Image.Image, cx: int, cy: int, amount: float, scale: float) -> Image.Image:
    if amount < 0.04:
        return frame

    amount = float(np.clip(amount, 0.0, 1.0))
    open_px = int((4 + 18 * amount) * scale)
    half_w = int((18 + 6 * amount) * scale)
    lip_h = int((4 + 6 * amount) * scale)

    overlay = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")

    # Dark inner mouth, deliberately small so it reads as talking rather than a cartoon gag.
    mouth_box = (
        cx - half_w,
        cy + int(1 * scale),
        cx + half_w,
        cy + open_px,
    )
    draw.ellipse(mouth_box, fill=(48, 18, 22, 175), outline=(124, 62, 60, 120), width=max(1, int(2 * scale)))

    # A subtle lower-lip highlight keeps the existing smile from turning into a black blob.
    highlight_y = cy + open_px - max(1, int(3 * scale))
    draw.arc(
        (cx - half_w, highlight_y - lip_h, cx + half_w, highlight_y + lip_h),
        start=8,
        end=172,
        fill=(225, 145, 130, 110),
        width=max(1, int(2 * scale)),
    )

    overlay = overlay.filter(ImageFilter.GaussianBlur(radius=0.25))
    return Image.alpha_composite(frame.convert("RGBA"), overlay).convert("RGB")


def main() -> None:
    raw_dir = TMP / "lipsync_raw_frames"
    out_dir = TMP / "lipsync_talking_frames"
    shutil.rmtree(raw_dir, ignore_errors=True)
    shutil.rmtree(out_dir, ignore_errors=True)
    raw_dir.mkdir(parents=True)
    out_dir.mkdir(parents=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)

    run([
        "ffmpeg",
        "-y",
        "-i",
        str(BASE_VIDEO),
        "-vf",
        f"fps={FPS}",
        str(raw_dir / "frame_%04d.png"),
    ])

    envelope = load_voice_envelope()
    frames = sorted(raw_dir.glob("frame_*.png"))
    for index, src in enumerate(frames):
        t = index / FPS
        image = Image.open(src).convert("RGB")
        mouth = mouth_for_time(t)
        if mouth:
            x, y, scale = mouth
            image = draw_mouth(image, x, y, float(envelope[index]), scale)
        image.save(out_dir / src.name)

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
        f"scale={WIDTH}:{HEIGHT},format=yuv420p",
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
