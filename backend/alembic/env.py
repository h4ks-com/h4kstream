"""Alembic environment configuration for database migrations."""

import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config
from sqlalchemy import pool
from sqlmodel import SQLModel

from alembic import context

# Add the parent directory to sys.path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.db.config import DATABASE_URL

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Set the SQLAlchemy URL from our app configuration
config.set_main_option("sqlalchemy.url", DATABASE_URL)

# Add SQLModel metadata for autogenerate support
target_metadata = SQLModel.metadata


def include_object(object, name, type_, reflected, compare_to):
    """Filter objects to include in autogenerate.

    Excludes FTS (Full-Text Search) virtual tables which are managed by SQLite triggers.
    """
    if type_ == "table" and name and name.endswith("_fts"):
        return False
    if type_ == "table" and name and ("_fts_" in name):
        return False
    return True


def compare_type(context, inspected_column, metadata_column, inspected_type, metadata_type):
    """Compare column types and ignore insignificant changes.

    Ignores differences between TEXT and AutoString as they're equivalent in SQLite.
    """
    return False


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL and not an Engine, though an Engine is acceptable here as well.  By
    skipping the Engine creation we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the script output.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,  # Enable batch mode for SQLite ALTER TABLE support
        include_object=include_object,  # Filter out FTS tables
        compare_type=compare_type,  # Ignore insignificant type changes
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine and associate a connection with the context.
    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,  # Enable batch mode for SQLite ALTER TABLE support
            include_object=include_object,  # Filter out FTS tables
            compare_type=compare_type,  # Ignore insignificant type changes
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
