"""add comment likes

Revision ID: 0002_comment_likes
Revises: 0001_initial
Create Date: 2026-05-03
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_comment_likes"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "comment_likes",
        sa.Column("comment_id", sa.String(length=36), sa.ForeignKey("comments.id"), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("comment_likes")
