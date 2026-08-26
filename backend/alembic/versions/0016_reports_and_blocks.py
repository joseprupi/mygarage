"""add reports and user_blocks tables

Revision ID: 0016_reports_and_blocks
Revises: 0015_media_privacy
Create Date: 2026-08-26

Adds:
  reports: UGC safety reporting (App Store requirement)
  user_blocks: mutual-block relationship
"""
from alembic import op
import sqlalchemy as sa

revision = "0016_reports_and_blocks"
down_revision = "0015_media_privacy"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reports",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("reporter_user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("target_type", sa.String(20), nullable=False),
        sa.Column("target_id", sa.String(255), nullable=False),
        sa.Column("reason", sa.String(30), nullable=False),
        sa.Column("details", sa.Text, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'open'")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("reporter_user_id", "target_type", "target_id", name="uq_report_per_reporter"),
        sa.CheckConstraint(
            "target_type in ('post','comment','user','vehicle','event')",
            name="ck_report_target_type",
        ),
        sa.CheckConstraint(
            "reason in ('spam','harassment','inappropriate','privacy','other')",
            name="ck_report_reason",
        ),
        sa.CheckConstraint("status in ('open','resolved')", name="ck_report_status"),
    )
    op.create_index("idx_reports_status_created", "reports", ["status", "created_at"])

    op.create_table(
        "user_blocks",
        sa.Column("blocker_user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("blocked_user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("blocker_user_id", "blocked_user_id"),
    )


def downgrade() -> None:
    op.drop_table("user_blocks")
    op.drop_index("idx_reports_status_created", table_name="reports")
    op.drop_table("reports")
