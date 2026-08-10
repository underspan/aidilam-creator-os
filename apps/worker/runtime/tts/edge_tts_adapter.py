#!/usr/bin/env python3
"""Edge TTS adapter for AIĐiLàm Studio.
Generates Vietnamese speech audio using Microsoft Edge TTS (free, no API key).

Usage: python3 edge_tts_adapter.py <text> <voice_id> <output_path> [speed]
"""
import sys
import asyncio
import edge_tts
import json
import os

async def synthesize(text: str, voice: str, output_path: str, speed: str = "+0%"):
    """Generate speech and save to file."""
    communicate = edge_tts.Communicate(text, voice, rate=speed)
    await communicate.save(output_path)
    
    # Validate output
    if not os.path.exists(output_path):
        return {"error": "Output file not created", "success": False}
    
    size = os.path.getsize(output_path)
    if size < 100:
        return {"error": "Output too small", "success": False, "size": size}
    
    # Check MPEG header
    with open(output_path, 'rb') as f:
        header = f.read(2)
        if header[0] != 0xFF or (header[1] & 0xE0) != 0xE0:
            return {"error": "Invalid audio format", "success": False}
    
    return {
        "success": True,
        "path": output_path,
        "size": size,
        "format": "mp3",
        "voice": voice,
    }

def main():
    if len(sys.argv) < 4:
        print(json.dumps({"error": "Usage: edge_tts_adapter.py <text> <voice> <output_path> [speed]"}))
        sys.exit(1)
    
    text = sys.argv[1]
    voice = sys.argv[2]
    output_path = sys.argv[3]
    speed = sys.argv[4] if len(sys.argv) > 4 else "+0%"
    
    result = asyncio.run(synthesize(text, voice, output_path, speed))
    print(json.dumps(result))
    sys.exit(0 if result.get("success") else 1)

if __name__ == "__main__":
    main()
