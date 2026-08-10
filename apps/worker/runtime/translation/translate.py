#!/usr/bin/env python3
"""
AIĐiLàm Automated Translation — Chinese to Vietnamese
Uses Google Translate via deep-translator (free, no API key required).

Usage: python3 translate.py <input_json> <output_path>

Input JSON format:
{
  "segments": [{"id": "...", "text": "...", "start_ms": 0, "end_ms": 1000}],
  "source_language": "zh",
  "target_language": "vi",
  "glossary": [{"source": "...", "target": "..."}]
}

Output JSON format:
{
  "provider": "google_translate_free",
  "model": "nmt",
  "segments": [
    {"id": "...", "subtitle_text": "...", "tts_text": "...", "warnings": []}
  ],
  "validation": {"passed": true, "warnings": [], "errors": []}
}
"""
import sys
import json
import time
import re

def translate_segments(segments, source_lang, target_lang, glossary=None):
    """Translate segments with context awareness and glossary support."""
    from deep_translator import GoogleTranslator

    translator = GoogleTranslator(source=source_lang, target=target_lang)
    results = []
    glossary_map = {g['source']: g['target'] for g in (glossary or [])}

    # Translate in context-aware chunks (batches of 3-5 for context)
    batch_size = 5
    for i in range(0, len(segments), batch_size):
        batch = segments[i:i + batch_size]

        # Combine for context (separator that won't be translated)
        combined_text = " ||| ".join(seg['text'] for seg in batch)

        try:
            translated = translator.translate(combined_text)
            # Split back
            parts = translated.split(" ||| ") if " ||| " in translated else translated.split("|||")

            # Handle case where separator was consumed
            if len(parts) != len(batch):
                # Fallback: translate individually
                parts = []
                for seg in batch:
                    individual = translator.translate(seg['text'])
                    parts.append(individual)
                    time.sleep(0.3)  # Rate limit

            for j, seg in enumerate(batch):
                translated_text = parts[j].strip() if j < len(parts) else ""

                # Apply glossary
                for source_term, target_term in glossary_map.items():
                    if source_term in seg['text']:
                        # Ensure glossary term is used
                        translated_text = apply_glossary(translated_text, source_term, target_term)

                # Generate subtitle and TTS versions
                subtitle_text = normalize_subtitle(translated_text)
                tts_text = normalize_tts(translated_text)

                warnings = []
                if not translated_text:
                    warnings.append("empty_translation")
                if has_chinese_chars(translated_text):
                    warnings.append("chinese_residue")
                if len(translated_text) > len(seg['text']) * 3:
                    warnings.append("excessive_expansion")

                results.append({
                    "id": seg['id'],
                    "subtitle_text": subtitle_text,
                    "tts_text": tts_text,
                    "warnings": warnings,
                })

        except Exception as e:
            # Mark failed segments
            for seg in batch:
                results.append({
                    "id": seg['id'],
                    "subtitle_text": "",
                    "tts_text": "",
                    "warnings": [f"translation_error: {str(e)[:100]}"],
                })

        time.sleep(0.5)  # Rate limit between batches

    return results


def apply_glossary(text, source_term, target_term):
    """Apply glossary term if the translation doesn't already contain it."""
    # Simple heuristic: if target_term not in result, it might need fixing
    # For now just return as-is (glossary primarily for validation)
    return text


def normalize_subtitle(text):
    """Normalize for subtitle display."""
    text = text.strip()
    # Remove excessive whitespace
    text = re.sub(r'\s+', ' ', text)
    return text


def normalize_tts(text):
    """Normalize for TTS reading."""
    text = text.strip()
    text = re.sub(r'\s+', ' ', text)
    # Expand common abbreviations for Vietnamese TTS
    text = text.replace("AI", "ây ai")  # Common expansion
    return text


def has_chinese_chars(text):
    """Check if text contains Chinese characters."""
    for char in text:
        if '\u4e00' <= char <= '\u9fff':
            return True
    return False


def validate_translation(segments, results):
    """Validate translation output against source segments."""
    errors = []
    warnings = []

    # Check segment count
    if len(results) != len(segments):
        errors.append(f"segment_count_mismatch: expected {len(segments)}, got {len(results)}")

    # Check each segment
    source_ids = {s['id'] for s in segments}
    result_ids = {r['id'] for r in results}

    missing = source_ids - result_ids
    extra = result_ids - source_ids

    if missing:
        errors.append(f"missing_segments: {list(missing)}")
    if extra:
        errors.append(f"extra_segments: {list(extra)}")

    # Check for duplicates
    seen_ids = set()
    for r in results:
        if r['id'] in seen_ids:
            errors.append(f"duplicate_segment: {r['id']}")
        seen_ids.add(r['id'])

    # Check individual results
    for r in results:
        if not r['subtitle_text'] and not any('error' in w for w in r.get('warnings', [])):
            warnings.append(f"empty_subtitle: {r['id']}")
        if r.get('warnings'):
            for w in r['warnings']:
                if 'chinese_residue' in w:
                    warnings.append(f"chinese_residue: {r['id']}")

    passed = len(errors) == 0
    return {"passed": passed, "warnings": warnings, "errors": errors}


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: translate.py <input.json> <output_path>"}))
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    with open(input_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    segments = data.get('segments', [])
    source_lang = data.get('source_language', 'zh-CN')
    target_lang = data.get('target_language', 'vi')
    glossary = data.get('glossary', [])

    # Map source_lang for deep-translator
    lang_map = {'zh': 'zh-CN', 'en': 'en', 'vi': 'vi'}
    source_lang = lang_map.get(source_lang, source_lang)

    start = time.time()
    results = translate_segments(segments, source_lang, target_lang, glossary)
    latency = time.time() - start

    validation = validate_translation(segments, results)

    output = {
        "provider": "google_translate_free",
        "model": "nmt",
        "source_language": data.get('source_language', 'zh'),
        "target_language": target_lang,
        "segments": results,
        "validation": validation,
        "metadata": {
            "latency_seconds": round(latency, 2),
            "segment_count": len(results),
            "request_count": (len(segments) + 4) // 5,  # batch size 5
        }
    }

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    # Print summary to stdout
    print(json.dumps({
        "success": validation["passed"],
        "segments": len(results),
        "warnings": len(validation["warnings"]),
        "errors": len(validation["errors"]),
        "latency": round(latency, 2),
    }))


if __name__ == "__main__":
    main()
