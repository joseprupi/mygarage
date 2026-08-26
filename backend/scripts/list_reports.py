"""List open UGC reports and optionally resolve one.

Usage (dev):
    cd backend
    .venv/bin/python scripts/list_reports.py
    .venv/bin/python scripts/list_reports.py --resolve <report-id>

Usage (prod — pass env vars):
    DATABASE_URL='postgresql+psycopg://...' \
      .venv/bin/python scripts/list_reports.py [--resolve <id>]

Exit codes: 0 = success, 1 = error.
"""
import sys
import os
import argparse


def _get_db():
    """Return a fresh database session, honouring DATABASE_URL from env."""
    from app.database import SessionLocal
    return SessionLocal()


def list_open(db) -> None:
    from sqlalchemy import select
    from app.models import Report, User

    rows = list(db.execute(
        select(
            Report.id,
            Report.created_at,
            Report.target_type,
            Report.target_id,
            Report.reason,
            Report.details,
            User.username.label("reporter_username"),
        )
        .join(User, User.id == Report.reporter_user_id)
        .where(Report.status == "open")
        .order_by(Report.created_at)
    ).all())

    if not rows:
        print("No open reports.")
        return

    print(f"{'ID':<36}  {'Created':<20}  {'Reporter':<20}  {'Target':<30}  {'Reason':<15}  Details")
    print("-" * 140)
    for row in rows:
        target = f"{row.target_type}/{row.target_id[:12]}"
        details = (row.details or "")[:40]
        created = str(row.created_at)[:19]
        print(f"{row.id:<36}  {created:<20}  {row.reporter_username:<20}  {target:<30}  {row.reason:<15}  {details}")


def resolve_report(db, report_id: str) -> None:
    from app.models import Report

    report = db.get(Report, report_id)
    if not report:
        print(f"Report {report_id!r} not found.", file=sys.stderr)
        sys.exit(1)
    if report.status == "resolved":
        print(f"Report {report_id} is already resolved.")
        return
    report.status = "resolved"
    db.commit()
    print(f"Report {report_id} resolved.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--resolve", metavar="ID", help="Resolve the report with this ID")
    args = parser.parse_args()

    db = _get_db()
    try:
        if args.resolve:
            resolve_report(db, args.resolve)
        else:
            list_open(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
