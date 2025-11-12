"""Migration runner script.

Runs all migration scripts in order to update the database schema.
"""

import importlib.util
import sys
from pathlib import Path


def run_migrations():
    """Run all migration scripts in order."""
    migrations_dir = Path(__file__).parent
    migration_files = sorted(migrations_dir.glob("0*.py"))

    if not migration_files:
        print("No migration files found")
        return True

    print(f"Found {len(migration_files)} migration(s)")
    print("=" * 60)

    all_success = True

    for migration_file in migration_files:
        print(f"\n▶️  Running: {migration_file.name}")
        print("-" * 60)

        # Import the migration module
        spec = importlib.util.spec_from_file_location("migration", migration_file)
        if spec and spec.loader:
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

            # Run the migrate function
            if hasattr(module, "migrate"):
                success = module.migrate()
                if not success:
                    all_success = False
                    print(f"❌ Migration {migration_file.name} failed")
            else:
                print(f"⚠️  No migrate() function found in {migration_file.name}")
                all_success = False
        else:
            print(f"❌ Could not load migration {migration_file.name}")
            all_success = False

    print("\n" + "=" * 60)
    if all_success:
        print("✅ All migrations completed successfully")
    else:
        print("❌ Some migrations failed")

    return all_success


if __name__ == "__main__":
    success = run_migrations()
    sys.exit(0 if success else 1)
