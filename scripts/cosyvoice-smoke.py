from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import torch
import torchaudio


PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = PROJECT_ROOT / "vendor" / "CosyVoice"
MODEL_ROOT = REPOSITORY_ROOT / "pretrained_models" / "CosyVoice2-0.5B"
PROMPT_WAV = REPOSITORY_ROOT / "asset" / "zero_shot_prompt.wav"
OUTPUT_ROOT = PROJECT_ROOT / "outputs" / "cosyvoice-smoke"
SMOKE_TEXT = "你好，这是一条知绘工厂本机配音验收语音。"
PROMPT_TEXT = "希望你以后能够做的比我还好呦。"

sys.path.insert(0, str(REPOSITORY_ROOT))
sys.path.insert(0, str(REPOSITORY_ROOT / "third_party" / "Matcha-TTS"))

from cosyvoice.cli.cosyvoice import CosyVoice2  # noqa: E402


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    if not MODEL_ROOT.is_relative_to(REPOSITORY_ROOT):
        raise RuntimeError("Model path resolved outside the CosyVoice repository.")
    if not PROMPT_WAV.is_file():
        raise FileNotFoundError(f"Bundled prompt audio is missing: {PROMPT_WAV}")

    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_ROOT / f"smoke-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.wav"
    if output_path.exists():
        raise FileExistsError(f"Refusing to overwrite existing smoke output: {output_path}")

    engine = CosyVoice2(str(MODEL_ROOT), load_jit=False, load_trt=False, load_vllm=False, fp16=False)
    chunks = [
        item["tts_speech"]
        for item in engine.inference_zero_shot(
            SMOKE_TEXT,
            PROMPT_TEXT,
            str(PROMPT_WAV),
            stream=False,
        )
    ]
    if not chunks:
        raise RuntimeError("CosyVoice returned no audio chunks.")

    audio = torch.cat(chunks, dim=1)
    torchaudio.save(str(output_path), audio, engine.sample_rate)
    size_bytes = output_path.stat().st_size
    if size_bytes <= 44:
        raise RuntimeError("Generated WAV is empty or invalid.")

    duration_seconds = float(audio.shape[1] / engine.sample_rate)
    print(
        json.dumps(
            {
                "resultType": "smoke_test",
                "businessEvidence": False,
                "publishable": False,
                "text": SMOKE_TEXT,
                "outputPath": str(output_path),
                "sizeBytes": size_bytes,
                "sha256": sha256(output_path),
                "sampleRate": engine.sample_rate,
                "durationSeconds": round(duration_seconds, 3),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
