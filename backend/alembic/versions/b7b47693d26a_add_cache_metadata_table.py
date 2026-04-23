"""Add cache_metadata table.

Revision ID: b7b47693d26a
Revises: a564c83ffa96
Create Date: 2026-04-23 18:03:23.468466
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'b7b47693d26a'
down_revision: str | Sequence[str] | None = 'a564c83ffa96'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'cache_metadata',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('cache_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(), nullable=True),
        sa.Column('artist', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['cache_id'], ['file_cache.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('cache_id', 'title', 'artist', name='uq_cache_metadata'),
    )
    op.create_index('ix_cache_metadata_cache_id', 'cache_metadata', ['cache_id'])
    op.create_index('ix_cache_metadata_title', 'cache_metadata', ['title'])
    op.create_index('ix_cache_metadata_artist', 'cache_metadata', ['artist'])


def downgrade() -> None:
    op.drop_index('ix_cache_metadata_artist', 'cache_metadata')
    op.drop_index('ix_cache_metadata_title', 'cache_metadata')
    op.drop_index('ix_cache_metadata_cache_id', 'cache_metadata')
    op.drop_table('cache_metadata')
