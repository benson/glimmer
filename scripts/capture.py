#!/usr/bin/env python3
"""Add one item to Glimmer's shared collection."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
import uuid
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "things.json"
MEDIA_PATH = ROOT / "public" / "media"
URL_RE = re.compile(r"https?://[^\s<>)\]}]+", re.IGNORECASE)
TIMECODE_RE = re.compile(r"\b(\d{1,2}):(\d{2})\s*(?:-|–|—|to)\s*(\d{1,2}):(\d{2})\b", re.IGNORECASE)
SINGLE_TIMECODE_RE = re.compile(r"\b(\d{1,2}):(\d{2})\b")


def parser() -> argparse.ArgumentParser:
    command = argparse.ArgumentParser(description="Keep a site, sound, image, or thought in Glimmer.")
    command.add_argument("text", nargs="?", default="", help="The user's own words about the thing")
    command.add_argument("--type", choices=("auto", "site", "sound", "image", "note"), default="auto")
    command.add_argument("--title", default="")
    command.add_argument("--url", default="")
    command.add_argument("--image", type=Path, help="Local image to copy into the collection")
    command.add_argument("--caption", default="")
    command.add_argument("--time", default="", help="Moment or range such as 1:15-1:25")
    command.add_argument("--dry-run", action="store_true")
    return command


def find_url(text: str) -> str:
    match = URL_RE.search(text)
    return match.group(0).rstrip(".,!?;:'\"") if match else ""


def parse_timecode(value: str) -> dict[str, str] | None:
    match = TIMECODE_RE.search(value)
    if match:
        start = f"{match.group(1)}:{match.group(2)}"
        end = f"{match.group(3)}:{match.group(4)}"
        return {"start": start, "end": end, "label": f"{start}–{end}"}
    match = SINGLE_TIMECODE_RE.search(value)
    if match:
        start = f"{match.group(1)}:{match.group(2)}"
        return {"start": start, "end": "", "label": start}
    return None


def infer_type(text: str, url: str, image: Path | None, timecode: dict[str, str] | None) -> str:
    if image or re.search(r"\.(?:avif|gif|jpe?g|png|webp)(?:\?.*)?$", url, re.IGNORECASE):
        return "image"
    if timecode or re.search(r"\b(song|track|album|music|sound|audio|voice|listen)\b", text, re.IGNORECASE):
        return "sound"
    return "site" if url else "note"


def fallback_title(text: str, url: str, item_type: str) -> str:
    without_url = URL_RE.sub("", text).strip(" \n\t\"'“”")
    generic = re.fullmatch(r"(?:i\s+)?(?:really\s+)?(?:love|like)\s+(?:this|the)\s+(?:site|song|track|picture|image)[.!]?", without_url, re.IGNORECASE)
    if url and (not without_url or generic):
        return urlparse(url).hostname.removeprefix("www.")
    if without_url:
        first = re.split(r"\n|[.!?](?:\s|$)", without_url, maxsplit=1)[0].strip()
        return first if len(first) <= 54 else f"{first[:51].rstrip()}…"
    return {"image": "an image worth keeping", "sound": "a beautiful moment"}.get(item_type, "untitled glimmer")


def unique_media_name(source: Path) -> str:
    stem = re.sub(r"[^a-z0-9]+", "-", source.stem.lower()).strip("-") or "image"
    return f"{datetime.now().strftime('%Y%m%d')}-{stem}-{uuid.uuid4().hex[:6]}{source.suffix.lower()}"


def main() -> int:
    args = parser().parse_args()
    if not args.text.strip() and not args.url and not args.image:
        print("Provide some text, a URL, or an image.", file=sys.stderr)
        return 2
    if args.image and (not args.image.exists() or not args.image.is_file()):
        print(f"Image not found: {args.image}", file=sys.stderr)
        return 2

    text = args.text.strip()
    url = args.url or find_url(text)
    timecode = parse_timecode(args.time or text)
    item_type = args.type if args.type != "auto" else infer_type(text, url, args.image, timecode)
    note = URL_RE.sub("", text).strip()
    now = datetime.now().astimezone()

    item: dict[str, object] = {
        "id": f"{now.strftime('%Y%m%d')}-{uuid.uuid4().hex[:10]}",
        "type": item_type,
        "title": args.title.strip() or fallback_title(text, url, item_type),
        "note": note,
        "capturedAt": now.isoformat(timespec="seconds"),
    }
    if url:
        item["url"] = url
    if args.caption:
        item["caption"] = args.caption.strip()
    if timecode:
        item["timecode"] = timecode

    copied_media: Path | None = None
    if args.image:
        media_name = unique_media_name(args.image)
        item["image"] = f"media/{media_name}"
        item["imageAlt"] = args.title.strip() or args.image.stem
        copied_media = MEDIA_PATH / media_name

    if args.dry_run:
        print(json.dumps(item, indent=2, ensure_ascii=False))
        return 0

    try:
        collection = json.loads(DATA_PATH.read_text(encoding="utf-8"))
        if not isinstance(collection, list):
            raise ValueError("Collection data is not a list")
    except (OSError, json.JSONDecodeError, ValueError) as error:
        print(f"Could not read {DATA_PATH}: {error}", file=sys.stderr)
        return 1

    if copied_media:
        MEDIA_PATH.mkdir(parents=True, exist_ok=True)
        shutil.copy2(args.image, copied_media)

    collection.append(item)
    temporary = DATA_PATH.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(collection, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary.replace(DATA_PATH)
    print(json.dumps(item, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
