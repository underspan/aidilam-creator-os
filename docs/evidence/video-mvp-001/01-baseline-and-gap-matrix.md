# VIDEOMVP-001 Evidence 01: Baseline and Gap Matrix

## Baseline Confirmed
- Repository: /opt/aidilam
- Branch: develop
- HEAD: c757dc5
- origin/develop: c757dc5
- Working tree: clean (only unrelated ops/ and .kiro/)

## Infrastructure Status
| Service | Status |
|---------|--------|
| aidilam-app | healthy |
| aidilam-worker | healthy |
| aidilam-postgres | healthy |
| aidilam-redis | healthy |
| aidilam-minio | healthy |
| aidilam-qdrant | healthy |
| FFmpeg | 6.1.1 available |
| ffprobe | 6.1.1 available |
| yt-dlp | 2026.07.04 available |
| faster-whisper | 1.2.1 (tiny model cached) |
| Python 3.12 | available |

## Existing Pipeline Capabilities

| Step | Module | Worker Job | API Routes | Status |
|------|--------|-----------|------------|--------|
| Asset Upload | assets | asset_ingest | POST initiate, POST complete | IMPLEMENTED |
| Media Analysis | media | media_preprocess | POST preprocess | IMPLEMENTED |
| Transcription | transcriptions | transcription_orchestrate | POST transcriptions | IMPLEMENTED |
| Translation | subtitles | subtitle_translate | (via job system) | IMPLEMENTED |
| TTS Synthesis | tts | tts_synthesize | POST tts-runs | IMPLEMENTED |
| Video Render | render | video_render | POST render-runs | IMPLEMENTED |
| Job Orchestration | jobs | registry + BullMQ | CRUD + cancel + retry | IMPLEMENTED |
| RBAC/Audit | security | — | integrated | IMPLEMENTED |

## Provider Status

| Provider Type | Available | Real | Mock |
|--------------|-----------|------|------|
| STT | mock_deterministic | faster-whisper (installed, not wired) | ✓ |
| Translation | mock_deterministic | Stubs only (OpenAI, Gemini, Azure) | ✓ |
| TTS | mock_deterministic | None configured | ✓ (sine wave) |

## Configuration Records Needed

| Record | Exists | Required For |
|--------|--------|-------------|
| Test project (active) | YES (draft projects exist) | Pipeline run |
| STT profile | YES (3 mock profiles) | Transcription |
| TTS provider record | NO (table exists, 0 rows) | TTS synthesis |
| TTS voice record | NO | TTS synthesis |
| TTS profile | NO (0 rows) | TTS synthesis |
| Render profile | NO (0 rows) | Video render |
| Subtitle style | NO (check) | Subtitle burn-in |

## What Works Now (Mock Pipeline)
- Upload MP4 → ingest → ffprobe analysis → mock transcription → mock translation → mock TTS (sine wave) → FFmpeg render → output MP4
- Produces technically valid MP4 with subtitle burn-in
- Audio is synthetic sine wave (not real Vietnamese speech)

## What's Missing for Real Vietnamese Speech

| Capability | Blocker | Owner Action |
|-----------|---------|-------------|
| Real transcription | faster-whisper STT provider not wired into worker | Implementation (A) |
| Real translation | No LLM API key configured | Owner provides API key |
| Real TTS Vietnamese | No TTS API key (ElevenLabs/Google TTS) | Owner provides API key + voice selection |

## Recommendation

### Option A: Mock E2E (immediately achievable)
Run the full pipeline with mock providers. Produces valid MP4 with:
- Synthetic word-timed subtitles
- Language-prefixed mock translation text
- Sine wave audio (not speech)
- Real FFmpeg render (H.264, AAC, subtitle burn-in)

**Proves**: pipeline works end-to-end, all jobs chain correctly

### Option B: Real transcription + mock rest (requires implementation)
Wire faster-whisper as local STT provider. Produces:
- Real word-level transcription from audio
- Mock translation (prefixed text)
- Sine wave TTS
- Real render

**Requires**: ~200 lines of local_whisper provider implementation

### Option C: Full real pipeline (requires owner credentials)
- Real transcription (faster-whisper)
- Real translation (OpenAI/Gemini API key)
- Real TTS (ElevenLabs/Google TTS API key)
- Real render

**Requires**: Owner provides at least 2 API keys + voice selection

## No implementation performed yet. Gap analysis only.
