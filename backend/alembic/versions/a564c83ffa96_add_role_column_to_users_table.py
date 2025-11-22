"""Add role column to users table.

Revision ID: a564c83ffa96
Revises:
Create Date: 2025-11-18 00:06:21.189785
"""
from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a564c83ffa96'
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add role column to users table with empty string default for existing users."""
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('role', sqlmodel.sql.sqltypes.AutoString(), server_default='', nullable=False))


def downgrade() -> None:
    """Remove role column from users table."""
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('role')
