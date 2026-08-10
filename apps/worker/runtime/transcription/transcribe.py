#!/usr/bin/env python3
"""AIĐiLàm Transcription Worker — Uses faster-whisper for speech-to-text."""
import sys
import json
import os

def transcribe(audio_path: str, model_name: str = "tiny", language: str = None):
    """Transcribe audio file and output JSON segments to stdout."""
    from faster_whisper import WhisperModel
    
    model = WhisperModel(model_name, compute_type="int8", device="cpu")
    
    kwargs = {"beam_size": 5, "vad_filter": True}
    if language and language != "auto":
        kwargs["language"] = language
    
    segments, info = model.transcribe(audio_path, **kwargs)
    
    result = {
        "language": info.language,
        "language_probability": info.language_probability,
        "duration_ms": int(info.duration * 1000) if info.duration else 0,
        "segments": []
    }
    
    for seg in segments:
        result["segments"].append({
            "start_ms": int(seg.start * 1000),
            "end_ms": int(seg.end * 1000),
            "text": seg.text.strip(),
            "confidence": round(1.0 - seg.no_speech_prob, 3) if seg.no_speech_prob else None,
        })
    
    json.dump(result, sys.stdout)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: transcribe.py <audio_path> [model] [language]"}))
        sys.exit(1)
    
    audio_path = sys.argv[1]
    model_name = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("WHISPER_MODEL", "tiny")
    language = sys.argv[3] if len(sys.argv) > 3 else None
    
    try:
        transcribe(audio_path, model_name, language)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
