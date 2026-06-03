#!/usr/bin/env python3
"""Post the Cost Tracker Pro announcement to LinkedIn as an image post.

LinkedIn UGC API flow: register image upload -> upload binary -> create
ugcPost with IMAGE shareMediaCategory and the asset URN.
"""
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

IMG_PATH = Path(
    "/Users/chloewilkes/Library/CloudStorage/"
    "GoogleDrive-chloe.developcoaching@gmail.com/My Drive/Claude Code/"
    "Develop Coaching/Marketing/Videos/Reels/To Edit/2026-06-03/"
    "thumbnail-square.jpg"
)
ENV_PATH = Path(
    "/Users/chloewilkes/Library/CloudStorage/"
    "GoogleDrive-chloe.developcoaching@gmail.com/My Drive/Claude Code/"
    "Develop Coaching/Marketing/Brain Content Rag/greg-brain/.env"
)

CAPTION = (
    "Just submitted our first app to the App Store.\n\n"
    "Cost Tracker Pro.\n\n"
    "The tool I wish I'd had when I was building loft conversions 20 years ago.\n\n"
    "Estimates. Budgets. Workforce tracking. RFIs to architects. Gantt charts. "
    "One app, not ten.\n\n"
    "Free for every mastermind member.\n\n"
    "Drop a comment if you want me to ping you when it goes live."
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
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def main():
    env = load_env()
    token = env["LINKEDIN_ACCESS_TOKEN"]
    author = env["LINKEDIN_AUTHOR_URN"]

    if not IMG_PATH.exists():
        raise SystemExit(f"Image not found: {IMG_PATH}")

    print(f"{'DRY' if DRY else 'LIVE'} — LinkedIn image post")
    print(f"Image  : {IMG_PATH.name} ({IMG_PATH.stat().st_size/1024:.1f} KB)")
    print(f"Author : {author}")
    print(f"Caption ({len(CAPTION)} chars):")
    for line in CAPTION.splitlines():
        print(f"  {line}")

    if DRY:
        return

    # 1. Register the image upload
    print("\n=== 1. Register upload ===")
    reg_body = json.dumps({
        "registerUploadRequest": {
            "recipes": ["urn:li:digitalmediaRecipe:feedshare-image"],
            "owner": author,
            "serviceRelationships": [
                {
                    "relationshipType": "OWNER",
                    "identifier": "urn:li:userGeneratedContent",
                }
            ],
        }
    }).encode()
    s, _, b = http(
        "POST", "https://api.linkedin.com/v2/assets?action=registerUpload",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-Restli-Protocol-Version": "2.0.0",
        },
        data=reg_body,
    )
    if s >= 300:
        raise SystemExit(f"registerUpload {s}: {b[:600]!r}")
    j = json.loads(b)
    upload_url = (
        j["value"]["uploadMechanism"]
        ["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]
        ["uploadUrl"]
    )
    asset = j["value"]["asset"]
    print(f"  asset    : {asset}")
    print(f"  uploadUrl: {upload_url[:80]}...")

    # 2. Upload the image bytes
    print("\n=== 2. Upload image bytes ===")
    img_bytes = IMG_PATH.read_bytes()
    s, _, b = http(
        "POST", upload_url,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "image/jpeg",
        },
        data=img_bytes,
    )
    if s >= 300:
        raise SystemExit(f"image upload {s}: {b[:600]!r}")
    print(f"  uploaded {len(img_bytes)/1024:.1f} KB (status {s})")

    # 3. Create the UGC post with the asset
    print("\n=== 3. Create ugcPost ===")
    post_body = json.dumps({
        "author": author,
        "lifecycleState": "PUBLISHED",
        "specificContent": {
            "com.linkedin.ugc.ShareContent": {
                "shareCommentary": {"text": CAPTION},
                "shareMediaCategory": "IMAGE",
                "media": [
                    {
                        "status": "READY",
                        "description": {"text": "Cost Tracker Pro — one app, built for builders."},
                        "media": asset,
                        "title": {"text": "Cost Tracker Pro"},
                    }
                ],
            }
        },
        "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
    }).encode()
    s, h, b = http(
        "POST", "https://api.linkedin.com/v2/ugcPosts",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-Restli-Protocol-Version": "2.0.0",
        },
        data=post_body,
    )
    if s >= 300:
        raise SystemExit(f"ugcPost {s}: {b[:600]!r}")
    urn = h.get("x-restli-id") or h.get("X-RestLi-Id") or json.loads(b or b"{}").get("id")
    print(f"  posted urn: {urn}")
    if urn:
        print(f"  link     : https://www.linkedin.com/feed/update/{urn}/")


if __name__ == "__main__":
    main()
