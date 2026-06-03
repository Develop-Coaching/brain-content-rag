#!/usr/bin/env python3
"""Post the Cost Tracker Pro announcement reel to Instagram + Facebook.

Adapted from scripts/post_hired_poorer.py. Uploads the .mov + the 9:16 cover
thumbnail to Supabase, then publishes:
  - Instagram Reel (with cover_url)
  - Facebook video (auto-thumbnail; FB picks a frame)

LinkedIn + X are handled manually by the user (square asset + captions
provided separately).

Usage:
  python3 post_cost_tracker_pro.py --dry-run
  python3 post_cost_tracker_pro.py
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

VIDEO_PATH = Path(
    "/Users/chloewilkes/Library/CloudStorage/"
    "GoogleDrive-chloe.developcoaching@gmail.com/My Drive/Claude Code/"
    "Develop Coaching/Marketing/Videos/Reels/To Edit/2026-06-03/"
    "copy_4F9BC9A5-42D1-4901-93C7-1601D94B9C86.mov"
)
COVER_PATH = VIDEO_PATH.parent / "thumbnail.jpg"

ENV_PATH = Path(
    "/Users/chloewilkes/Library/CloudStorage/"
    "GoogleDrive-chloe.developcoaching@gmail.com/My Drive/Claude Code/"
    "Develop Coaching/Marketing/Brain Content Rag/greg-brain/.env"
)

CAPTION = (
    "Just submitted our first app to the App Store. Cost Tracker Pro.\n\n"
    "The tool I wish I'd had when I was building loft conversions 20 years ago.\n\n"
    "Estimates. Budgets. Workforce. RFIs to architects. Gantt charts. "
    "One app, not ten.\n\n"
    "Free for every mastermind member.\n\n"
    "Comment TRACKER and I'll DM you when it goes live."
)

DRY = "--dry-run" in sys.argv


def load_env():
    env = {}
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def http(method, url, *, headers=None, data=None, timeout=180):
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.headers, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read()


def supa_upload(env, local: Path, prefix: str, content_type: str) -> str:
    supa_url = env["SUPABASE_URL"].rstrip("/")
    key = env["SUPABASE_SERVICE_ROLE_KEY"]
    bucket = env.get("PUBLISHER_IMAGE_BUCKET", "publisher-images")
    object_key = f"{prefix}/{int(time.time()*1000)}-{local.name}"
    body = local.read_bytes()
    print(f"  -> uploading {len(body)/1024/1024:.2f} MB to {bucket}/{object_key}")
    status, _, resp = http(
        "POST",
        f"{supa_url}/storage/v1/object/{bucket}/{urllib.parse.quote(object_key)}",
        headers={
            "Authorization": f"Bearer {key}",
            "apikey": key,
            "Content-Type": content_type,
            "x-upsert": "false",
        },
        data=body,
    )
    if status >= 300:
        raise SystemExit(f"Supabase upload failed [{status}]: {resp[:500]!r}")
    public = f"{supa_url}/storage/v1/object/public/{bucket}/{urllib.parse.quote(object_key)}"
    print(f"  -> {public}")
    return public


def post_ig_reel(env, video_url, cover_url):
    token = env["META_ACCESS_TOKEN"]
    ig = env["META_IG_USER_ID"]
    graph = "https://graph.facebook.com/v21.0"

    payload = {
        "media_type": "REELS",
        "video_url": video_url,
        "caption": CAPTION,
        "cover_url": cover_url,
        "share_to_feed": "true",
        "access_token": token,
    }
    status, _, body = http(
        "POST", f"{graph}/{ig}/media",
        headers={"Content-Type": "application/json"},
        data=json.dumps(payload).encode(),
    )
    j = json.loads(body or b"{}")
    if status >= 300 or not j.get("id"):
        return False, f"IG container create {status}: {j}"
    container = j["id"]
    print(f"  container: {container}")

    deadline = time.time() + 300
    last = None
    while time.time() < deadline:
        time.sleep(6)
        s, _, b = http("GET", f"{graph}/{container}?fields=status_code&access_token={token}")
        sj = json.loads(b or b"{}")
        last = sj.get("status_code")
        print(f"  status: {last}")
        if last == "FINISHED":
            break
        if last == "ERROR":
            return False, f"IG processing ERROR: {sj}"
    if last != "FINISHED":
        return False, f"IG processing timed out (last={last})"

    s, _, b = http(
        "POST", f"{graph}/{ig}/media_publish",
        headers={"Content-Type": "application/json"},
        data=json.dumps({"creation_id": container, "access_token": token}).encode(),
    )
    pj = json.loads(b or b"{}")
    if s >= 300 or not pj.get("id"):
        return False, f"IG publish {s}: {pj}"
    media_id = pj["id"]
    s2, _, b2 = http("GET", f"{graph}/{media_id}?fields=permalink&access_token={token}")
    perma = (json.loads(b2 or b"{}") or {}).get("permalink", "")
    return True, perma or f"ig media id {media_id}"


def post_fb_video(env, video_url):
    token = env.get("META_PAGE_ACCESS_TOKEN") or env["META_ACCESS_TOKEN"]
    page = env["META_FB_PAGE_ID"]
    graph = "https://graph.facebook.com/v21.0"
    status, _, body = http(
        "POST", f"{graph}/{page}/videos",
        headers={"Content-Type": "application/json"},
        data=json.dumps({
            "file_url": video_url,
            "description": CAPTION,
            "access_token": token,
        }).encode(),
    )
    j = json.loads(body or b"{}")
    if status >= 300 or not j.get("id"):
        return False, f"FB video {status}: {j}"
    return True, f"https://facebook.com/{j['id']}"


def main():
    env = load_env()
    if not VIDEO_PATH.exists():
        raise SystemExit(f"Video not found: {VIDEO_PATH}")
    if not COVER_PATH.exists():
        raise SystemExit(f"Cover not found: {COVER_PATH}")

    print(f"\n{'DRY RUN' if DRY else 'LIVE'} — Cost Tracker Pro reel\n")
    print(f"Video : {VIDEO_PATH.name} ({VIDEO_PATH.stat().st_size/1024/1024:.1f} MB)")
    print(f"Cover : {COVER_PATH.name} ({COVER_PATH.stat().st_size/1024:.1f} KB)")
    print(f"Caption ({len(CAPTION)} chars):")
    for line in CAPTION.splitlines():
        print(f"  {line}")
    print("\nPlatforms: Instagram Reel, Facebook video")

    if DRY:
        print("\nDry run — no upload, no API calls.")
        return

    print("\n=== Upload cover ===")
    cover_url = supa_upload(env, COVER_PATH, "cost-tracker-pro", "image/jpeg")
    print("\n=== Upload video ===")
    video_url = supa_upload(env, VIDEO_PATH, "cost-tracker-pro", "video/quicktime")

    results = []

    print("\n=== Instagram Reel ===")
    ok, info = post_ig_reel(env, video_url, cover_url)
    results.append(("instagram", ok, info))
    print(f"   {'OK' if ok else 'ERR'}: {info}")

    print("\n=== Facebook video ===")
    ok, info = post_fb_video(env, video_url)
    results.append(("facebook", ok, info))
    print(f"   {'OK' if ok else 'ERR'}: {info}")

    print("\n--- Results ---")
    for plat, ok, info in results:
        print(f"  [{'OK ' if ok else 'ERR'}] {plat:<10} {info}")
    failed = sum(1 for _, ok, _ in results if not ok)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
