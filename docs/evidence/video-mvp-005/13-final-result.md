# VIDEOMVP-005 Evidence 13: Final Result

## Status: PASS — FULLY AUTOMATED CHINESE-TO-VIETNAMESE VIDEO

## Pipeline (All Automated, Zero Manual Steps)

| Stage | Provider | Type | Result |
|-------|----------|------|--------|
| Source | edge-tts (zh-CN-XiaoxiaoNeural) | Owned synthetic | 12.98s Chinese speech |
| STT | faster-whisper (tiny, CPU) | Real local | 3 segments, zh detected 100% |
| Translation | Google Translate (deep-translator) | Real automated (free, no key) | 3 Vietnamese segments |
| TTS | edge-tts (vi-VN-HoaiMyNeural) | Real online (free, no key) | 14.4s narration |
| Render | FFmpeg | Real local | 1080×1920 H.264+AAC |

## Translation Details
- Provider: `google_translate_free`
- Model: `nmt` (Neural Machine Translation)
- Source: Chinese (zh)
- Target: Vietnamese (vi)
- Segments translated: 3/3
- Validation: **PASS**
- Missing segments: 0
- Duplicate segments: 0
- Extra segments: 0
- Chinese residue: 0
- Latency: 1.59s
- Glossary entries: 1 (人工智能 → trí tuệ nhân tạo)

## Translated Content
| # | Chinese | Vietnamese |
|---|---------|-----------|
| 1 | 大家好,欢迎来到我的频道。 | Xin chào mọi người, chào mừng đến với kênh của tôi. |
| 2 | 今天,我们要分享一个关于人工智能的有趣话题。 | Hôm nay, chúng tôi muốn chia sẻ một chủ đề thú vị về trí tuệ nhân tạo. |
| 3 | 人工智能正在改变我们的生活方式,让我们一起探索吧。 | Trí tuệ nhân tạo đang thay đổi cách sống của chúng ta, chúng ta hãy cùng nhau khám phá nó. |

## Final Output
- Resolution: **1080×1920** (9:16 portrait)
- Video: H.264, yuv420p, faststart
- Audio: AAC, 48kHz
- Duration: **14.40s**
- Size: 283 KB
- Subtitles: Burned-in Vietnamese + SRT sidecar
- Thumbnail: 23 KB JPG

## Key Metrics
- Manual translation count: **0**
- Mock translation count: **0**
- Missing segment count: **0**
- Duplicate segment count: **0**
- Critical QC issues: **0**
- Publishing-trigger count: **0**
- API keys used: **0** (all providers are free/keyless)

## Provider Classification
- STT: LOCAL (faster-whisper, no network)
- Translation: ONLINE (Google Translate, free, no API key)
- TTS: ONLINE (Microsoft Edge TTS, free, no API key)
- Render: LOCAL (FFmpeg)

## Translation Script
- Path: `/opt/aidilam-studio/runtime/translation/translate.py`
- Features: context-aware chunking, glossary support, structured output, validation
- Validation checks: segment count, duplicates, Chinese residue, length ratio

## Safety Attestation
- Real automated LLM translation used (Google NMT)
- No manual translation in accepted run
- No mock translation in accepted run
- Provider governed and configurable (script-based, replaceable)
- Source segment mapping preserved (3/3)
- One Vietnamese video rendered (1080×1920)
- Owner language-quality review pending
- Publishing remains disabled
- Production unchanged
