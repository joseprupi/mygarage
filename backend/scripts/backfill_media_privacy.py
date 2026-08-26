"""Backfill media privacy: blur placeholders + PII classification for vehicle event media/docs.

Also migrates existing event media/documents from the public bucket to the private bucket,
and sets storage_key on each row.

Usage (dev):
    cd backend
    .venv/bin/python scripts/backfill_media_privacy.py

Usage (prod — pass env vars as you would for migrate.sh):
    DATABASE_URL='postgresql+psycopg://...' \
    STORAGE_ENDPOINT_URL='https://storage.googleapis.com' \
    STORAGE_BUCKET='mygarage-app-9feafd-media' \
    STORAGE_PRIVATE_BUCKET='mygarage-app-9feafd-private' \
    STORAGE_ACCESS_KEY_ID='...' \
    STORAGE_SECRET_ACCESS_KEY='...' \
    PUBLIC_MEDIA_BASE_URL='https://storage.googleapis.com/mygarage-app-9feafd-media' \
    GEMINI_API_KEY='...' \
      .venv/bin/python scripts/backfill_media_privacy.py [--limit N] [--dry-run]

Options:
    --limit N     Process at most N rows (default: unlimited)
    --dry-run     Print what would be done without making any changes
    --skip-move   Skip moving objects to the private bucket (blur + classify only)

Rate-limit: ~1 row/second (Gemini API). Each row: fetch → blur → classify → update.

Exit codes: 0 = success, 1 = partial failure (some rows errored).
"""

import argparse
import sys
import time

# Must set env vars before any app imports
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--limit", type=int, default=0, help="Max rows to process (0=unlimited)")
    parser.add_argument("--dry-run", action="store_true", help="Print plan without making changes")
    parser.add_argument("--skip-move", action="store_true", help="Skip private-bucket migration")
    args = parser.parse_args()

    from app.config import get_settings
    from app.database import SessionLocal
    from app.models import VehicleEventMedia, VehicleEventDocument
    from app.services import (
        _s3_client,
        _object_key_from_url,
        make_blur_placeholder,
        classify_media_pii,
        _ensure_private_bucket,
    )
    from sqlalchemy import select

    settings = get_settings()
    client = _s3_client()

    if not args.skip_move:
        _ensure_private_bucket()

    errors = 0

    def process_media_row(db, row: VehicleEventMedia) -> bool:
        """Process one media row. Returns True on success."""
        nonlocal errors
        storage_key = row.storage_key or _object_key_from_url(row.url)
        if not storage_key:
            print(f"  [WARN] media {row.id}: cannot derive key from url={row.url!r}, skipping")
            return False

        # Determine which bucket the object currently lives in
        if row.storage_key:
            # Already in private bucket
            src_bucket = settings.storage_private_bucket
        else:
            src_bucket = settings.storage_bucket

        # Fetch bytes
        try:
            obj = client.get_object(Bucket=src_bucket, Key=storage_key)
            content = obj["Body"].read()
            mime = obj.get("ContentType", "image/jpeg")
        except Exception as exc:
            print(f"  [ERROR] media {row.id}: fetch failed: {exc}")
            errors += 1
            return False

        # Move to private bucket if not already there and skip_move is not set
        if not args.skip_move and not row.storage_key:
            if args.dry_run:
                print(f"  [DRY] media {row.id}: would copy {storage_key} → private bucket")
            else:
                try:
                    client.put_object(
                        Bucket=settings.storage_private_bucket,
                        Key=storage_key,
                        Body=content,
                        ContentType=mime,
                    )
                    # Delete from public bucket after successful copy
                    try:
                        client.delete_object(Bucket=settings.storage_bucket, Key=storage_key)
                    except Exception as e:
                        print(f"  [WARN] media {row.id}: delete from public failed: {e}")
                except Exception as exc:
                    print(f"  [ERROR] media {row.id}: private-bucket write failed: {exc}")
                    errors += 1
                    return False

        # Generate blur placeholder
        blur_url = row.blur_url
        if blur_url is None and mime.startswith("image/"):
            if args.dry_run:
                print(f"  [DRY] media {row.id}: would generate blur placeholder")
            else:
                try:
                    blur_bytes = make_blur_placeholder(content)
                    blur_key = f"event_media_blur/{row.id}-blur.jpg"
                    client.put_object(
                        Bucket=settings.storage_bucket,  # blur goes to PUBLIC bucket
                        Key=blur_key,
                        Body=blur_bytes,
                        ContentType="image/jpeg",
                    )
                    blur_url = f"{settings.public_media_base_url}/{blur_key}"
                    print(f"  [OK] media {row.id}: blur generated ({len(blur_bytes)} bytes)")
                except Exception as exc:
                    print(f"  [WARN] media {row.id}: blur generation failed: {exc}")

        # PII classification
        pii_status = row.pii_status
        pii_kinds = row.pii_kinds or []
        if pii_status == "unknown" and settings.ai_scan_enabled:
            if args.dry_run:
                print(f"  [DRY] media {row.id}: would run PII classification")
            else:
                try:
                    result = classify_media_pii(content, mime)
                    pii_kinds = result["pii_kinds"]
                    pii_status = "detected" if pii_kinds else "none"
                    print(f"  [OK] media {row.id}: pii_status={pii_status} kinds={pii_kinds}")
                except Exception as exc:
                    print(f"  [WARN] media {row.id}: PII classify failed: {exc}")

        if not args.dry_run:
            row.storage_key = row.storage_key or storage_key
            row.blur_url = blur_url
            row.pii_status = pii_status
            row.pii_kinds = pii_kinds
            db.commit()

        return True

    def process_doc_row(db, row: VehicleEventDocument) -> bool:
        """Process one document row. Returns True on success."""
        nonlocal errors
        storage_key = row.storage_key or _object_key_from_url(row.url)
        if not storage_key:
            print(f"  [WARN] doc {row.id}: cannot derive key from url={row.url!r}, skipping")
            return False

        src_bucket = settings.storage_private_bucket if row.storage_key else settings.storage_bucket
        try:
            obj = client.get_object(Bucket=src_bucket, Key=storage_key)
            content = obj["Body"].read()
            mime = obj.get("ContentType", row.content_type or "application/pdf")
        except Exception as exc:
            print(f"  [ERROR] doc {row.id}: fetch failed: {exc}")
            errors += 1
            return False

        if not args.skip_move and not row.storage_key:
            if args.dry_run:
                print(f"  [DRY] doc {row.id}: would copy {storage_key} → private bucket")
            else:
                try:
                    client.put_object(
                        Bucket=settings.storage_private_bucket,
                        Key=storage_key,
                        Body=content,
                        ContentType=mime,
                    )
                    try:
                        client.delete_object(Bucket=settings.storage_bucket, Key=storage_key)
                    except Exception as e:
                        print(f"  [WARN] doc {row.id}: delete from public failed: {e}")
                except Exception as exc:
                    print(f"  [ERROR] doc {row.id}: private-bucket write failed: {exc}")
                    errors += 1
                    return False

        pii_status = row.pii_status
        pii_kinds = row.pii_kinds or []
        if pii_status == "unknown" and settings.ai_scan_enabled:
            if args.dry_run:
                print(f"  [DRY] doc {row.id}: would run PII classification")
            else:
                try:
                    result = classify_media_pii(content, mime)
                    pii_kinds = result["pii_kinds"]
                    pii_status = "detected" if pii_kinds else "none"
                    print(f"  [OK] doc {row.id}: pii_status={pii_status} kinds={pii_kinds}")
                except Exception as exc:
                    print(f"  [WARN] doc {row.id}: PII classify failed: {exc}")

        if not args.dry_run:
            row.storage_key = row.storage_key or storage_key
            row.pii_status = pii_status
            row.pii_kinds = pii_kinds
            db.commit()

        return True

    with SessionLocal() as db:
        # Fetch rows needing work: missing storage_key OR pii_status='unknown' OR blur_url=None
        from sqlalchemy import or_, null
        media_query = select(VehicleEventMedia).where(
            or_(
                VehicleEventMedia.storage_key.is_(None),
                VehicleEventMedia.pii_status == "unknown",
                VehicleEventMedia.blur_url.is_(None),
            )
        )
        doc_query = select(VehicleEventDocument).where(
            or_(
                VehicleEventDocument.storage_key.is_(None),
                VehicleEventDocument.pii_status == "unknown",
            )
        )

        media_rows = list(db.scalars(media_query))
        doc_rows = list(db.scalars(doc_query))

        if args.limit:
            media_rows = media_rows[: args.limit]
            doc_rows = doc_rows[: max(0, args.limit - len(media_rows))]

        total = len(media_rows) + len(doc_rows)
        print(f"Backfill: {len(media_rows)} media rows + {len(doc_rows)} doc rows to process")
        if args.dry_run:
            print("[DRY RUN mode — no changes will be made]")

        processed = 0
        for row in media_rows:
            print(f"[{processed + 1}/{total}] media {row.id} pii={row.pii_status} key={row.storage_key}")
            process_media_row(db, row)
            processed += 1
            if not args.dry_run and settings.ai_scan_enabled:
                time.sleep(1)  # Rate-limit Gemini calls

        for row in doc_rows:
            print(f"[{processed + 1}/{total}] doc {row.id} pii={row.pii_status} key={row.storage_key}")
            process_doc_row(db, row)
            processed += 1
            if not args.dry_run and settings.ai_scan_enabled:
                time.sleep(1)

    print(f"\nDone: {processed} rows processed, {errors} errors.")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
