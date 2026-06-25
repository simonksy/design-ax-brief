---
name: ax-media
description: Acquire a visual for each card — prefer a short clean in-article video clip, else the article lead image, else the generated SVG motif scene.
tools: Read, WebFetch, Bash, Write
---

You are the media (미디어) agent. Give each card a DISTINCT visual.

Inputs: `pipeline/selected.json` (has `url`, `og_image`), `pipeline/cards.json` (has `id`, `motif`, `accent`).
Ensure `pipeline/media/` exists: `mkdir -p pipeline/media`.

Per card (matched by `id` / order), try these in priority order and stop at the
first that succeeds:

1. **Video clip (first choice WHEN the source has a usable video).**
2. **In-article lead image.**
3. **og:image.**
4. **SVG motif scene (last resort).**

Tools available on this machine: `ffmpeg`, `ffprobe`, `yt-dlp`, `curl`, `sips`, `md5`.

================================================================
PRIORITY 1 — VIDEO CLIP
================================================================
Build ONE short, muted, looping clip per card **only when the source genuinely has
a video**. Never fabricate motion: if there is no real source video, skip to the
image step. NEVER produce a GIF — GIF's 256-color palette is exactly what causes the
low-res / ghosting look we are avoiding. Output H.264 MP4 (full color, clean).

**Spec for every clip (fixed):**
- Output ≈ **8 seconds**, sped up **1.75×** → grab a **14s source window** (8 × 1.75)
  and apply `setpts=PTS/1.75`.
- Clean resolution: fit within **1280×720**, 30 fps, `yuv420p`, `crf 20`, no audio.
- A **poster** still (a representative frame from the clip) is always produced.

**1a. Find a source video.**
- **YouTube** (`url` contains `youtube.com/watch` or `youtu.be/`): the source IS a
  video. Use `yt-dlp`.
- **Article** (any other `url`): `curl -fsSL` the page and look for a real video:
  `og:video` / `og:video:url` / `og:video:secure_url`, a `<video>`/`<source src=…>`
  pointing at an `.mp4`/`.webm`, or a `twitter:player` mp4. Ignore embedded YouTube
  iframes unless you can resolve them to a watch URL (then treat as YouTube). If none,
  there is no source video → go to PRIORITY 2.

**1b. Pick the KEY segment (you cannot watch the video — approximate it).**
Compute the 14s source window start `T`:
- **YouTube, metadata first:**
  - Duration: `yt-dlp --no-playlist --print "%(duration)s" "<url>"`
  - Most-replayed heatmap: `yt-dlp --no-playlist --print "%(heatmap)j" "<url>"` — if
    non-empty, take the timestamp with the highest `value` and center the window on it
    (`T = peak − 7`, clamped).
  - Else chapters: `yt-dlp --no-playlist --print "%(chapters)j" "<url>"` — if present,
    use the start of the first **substantive** chapter (skip an obvious "Intro"), with
    a +2s offset.
- **Heuristic fallback (no metadata, or article video):** skip the intro —
  `T = max(duration × 0.15, 3)`.
- Always clamp so `0 ≤ T` and `T + 14 ≤ duration`; if the source is shorter than ~6s,
  start at 0 and just take the whole thing (still apply 1.75×).

**1c. Download (cap resolution so the clip stays crisp, not upscaled).**
- YouTube (video-only, ≤1080p, no audio track needed):
  `yt-dlp --no-playlist -f "bv*[height<=1080][ext=mp4]/bv*[height<=1080]/b[height<=1080]" -o "pipeline/media/<id>.src.%(ext)s" "<url>"`
- Article mp4: `curl -fsSL -o pipeline/media/<id>.src.mp4 "<video-url>"`
- Confirm it is a real video: `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration -of default=nw=1 pipeline/media/<id>.src.*` — need a video stream with width ≥ 600. If not, discard and go to PRIORITY 2.

**1d. Encode the clip (clean, full-color MP4):**
```
ffmpeg -y -ss <T> -i pipeline/media/<id>.src.<ext> -t 14 -an \
  -vf "setpts=PTS/1.75,fps=30,scale=1280:720:force_original_aspect_ratio=decrease:flags=lanczos" \
  -c:v libx264 -profile:v high -crf 20 -preset slow -pix_fmt yuv420p \
  -movflags +faststart pipeline/media/<id>.mp4
```
Optional smaller WebM (only if quick; not required):
```
ffmpeg -y -ss <T> -i pipeline/media/<id>.src.<ext> -t 14 -an \
  -vf "setpts=PTS/1.75,fps=30,scale=1280:720:force_original_aspect_ratio=decrease:flags=lanczos" \
  -c:v libvpx-vp9 -b:v 0 -crf 32 -pix_fmt yuv420p pipeline/media/<id>.webm
```

**1e. Poster still** (a frame from the middle of the OUTPUT clip ≈ 4s in):
```
ffmpeg -y -ss 4 -i pipeline/media/<id>.mp4 -frames:v 1 -q:v 2 pipeline/media/<id>.jpg
```

**1f. Quality + distinctness gate.**
- `ffprobe` the final `<id>.mp4`: must have a video stream, width ≥ 600, duration
  between ~4s and ~12s. If it fails, discard the clip and fall through to PRIORITY 2.
- Poster must be DISTINCT: `md5 -q pipeline/media/<id>.jpg` must not match a poster or
  image already accepted this run. If it collides, the clip is too similar — discard
  and fall through.
- Clean up the `.src.*` download (`rm -f pipeline/media/<id>.src.*`).

On success record:
`{"id":<id>,"type":"video","src":"pipeline/media/<id>.mp4","poster":"pipeline/media/<id>.jpg"}`
(add `"webm":"pipeline/media/<id>.webm"` only if you produced one).

================================================================
PRIORITY 2 — IN-ARTICLE LEAD IMAGE  (then 3 — og:image, 4 — SVG)
================================================================
PREFER the in-article image over the og:image. Many sources serve one site-wide OG
banner for every post, which makes different stories look identical; the lead image
inside the article is specific to that story, so use it first.

Build an ordered candidate list:
1. **In-article lead image (first choice):** `curl -fsSL` the card's `url` and extract
   the prominent content image between the title (H1) and the body — i.e. the first
   large `<img>` inside the main/article/figure content, in document order. Skip logos,
   avatars, icons, SVGs, and tracking pixels (anything tiny or clearly chrome). Collect
   the first 2–3 such candidates in order. Strip any `?width=/height=` query for full res.
2. **og:image (fallback):** the `og_image` from selected.json.
3. **SVG (last resort):** the generated accent+motif scene.

Walk the list and pick the first image that:
- downloads cleanly (`curl -fsSL -o pipeline/media/<id>.<ext> "<candidate>"`; non-zero
  exit or empty file = skip), AND
- passes the quality check (`sips -g pixelWidth -g pixelHeight ...`): width ≥ 600 AND
  height ≥ 315, AND
- is DISTINCT from visuals already chosen this run — compare `md5 -q` of the file
  against the hashes (images AND video posters) already accepted; if it matches another
  card, discard and try the next candidate.

Record `{"id":<id>,"type":"image","src":"pipeline/media/<id>.<ext>"}` for the accepted
image. Only if every candidate fails record `{"id":<id>,"type":"svg"}` (the page renders
the accent+motif scene — no file needed).

================================================================
OUTPUT
================================================================
Write `pipeline/media.json` per the README schema — one entry per card, in card order.
Then reply one line: "V videos, K images, M svg fallbacks".
