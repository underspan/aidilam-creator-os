# VIDEOMVP-002 Evidence 14: Owner Review Instructions

## How to Review the Video

### Step 1: Download
Access the review video through the authenticated API:

```
POST /api/v1/projects/8232faa5-84ac-49d7-8ed4-42ee2f576d1b/assets/49ec7c0d-d6e4-4582-9f29-c1d61dc0a49b/download-url
Authorization: Bearer <your-token>
```

Or use the asset ID directly through the AIĐiLàm interface.

### Step 2: Playback Verification
1. Open the MP4 in VLC, browser, or phone
2. Verify portrait (9:16) layout displays correctly
3. Verify Vietnamese subtitle glyphs render without missing characters
4. Listen to the Vietnamese narration (HoaiMyNeural female voice)
5. Verify narration matches the subtitle text
6. Verify subtitle timing matches speech

### Step 3: Quality Assessment
- [ ] Portrait layout correct (no stretched/squished content)
- [ ] Vietnamese diacritics visible (ề, ứ, ạ, ở, etc.)
- [ ] Narration audible and clear
- [ ] Original audio ducked (not competing with narration)
- [ ] No audio clipping
- [ ] Subtitles readable (contrast, size, position)
- [ ] No subtitle overlap
- [ ] No blank/missing frames

### Step 4: Content Verification
- Source: Synthetic Chinese speech (owned, no copyright)
- Translation: "大家好,欢迎来到我的频道" → "Xin chào mọi người, chào mừng đến với kênh của tôi"
- This is a correct, natural Vietnamese translation

### Step 5: Decision
- **APPROVE**: Video meets quality standard for the pipeline proof
- **REJECT**: Specify issues for correction

### Important Notes
- This is a PIPELINE PROOF, not a production video
- Source content is synthetic (not real creator content)
- TTS voice is Microsoft Edge (free tier, acceptable for proof)
- Translation was human-verified (automated translation needs API key)
- No platform upload has been or will be performed without separate approval

## Owner approval status: PENDING
## No automatic action will be taken on this video.
