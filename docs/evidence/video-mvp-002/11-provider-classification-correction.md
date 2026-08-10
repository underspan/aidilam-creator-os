# VIDEOMVP-002 Evidence 11: Provider Classification Correction

## Corrections Applied

| Provider | Previous Claim | Corrected Classification |
|----------|---------------|--------------------------|
| faster-whisper | "real local" | **Real local inference** (correct, no change) |
| Translation | "real" | **Human-governed manual** (not automated) |
| edge-tts | implied "local" | **Online Microsoft Edge service** (requires network) |

## Accurate Provider Classification

### STT: faster-whisper
- Type: LOCAL INFERENCE
- Model: Systran/faster-whisper-tiny (cached)
- Network required: NO
- API key required: NO
- Compute: CPU (int8 quantization)
- Classification: **Real local provider**

### Translation: Human-Governed
- Type: MANUAL INPUT
- Network required: NO
- API key required: NO
- Automated: NO
- Classification: **Real human translation (not automated)**
- Note: Fully automated Chinese→Vietnamese translation requires an LLM API key (not configured)

### TTS: edge-tts
- Type: ONLINE SERVICE
- Provider: Microsoft Edge neural TTS
- Network required: **YES** (connects to Microsoft servers)
- API key required: NO (free tier, no authentication)
- Paid credential: NO
- Classification: **Real online TTS (free, no owner credential)**

## External Call Count
- STT: 0 network calls
- Translation: 0 network calls
- TTS: **2 network calls** (one per segment, to Microsoft Edge servers)
- Render: 0 network calls
- Total external calls: **2** (TTS only)

## What This Does NOT Claim
- Does not claim all stages are local
- Does not claim external calls = 0
- Does not claim automated translation is complete
- Does not claim production-grade TTS provider is finalized
- Does not claim owner approval received
