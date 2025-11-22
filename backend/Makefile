.PHONY: fix check test generate-migration migrate

fix:
	@echo "Running pre-commit with auto-fix..."
	pre-commit run --all-files
	@echo "✅ All fixes applied!"

check:
	@echo "Running pre-commit checks..."
	pre-commit run --all-files
	@echo "✅ All checks passed!"

test:
	@echo "Running tests in parallel..."
	uv run pytest -n auto
	@echo "✅ Tests completed!"

generate-migration:
	@echo "Generating new migration..."
	@read -p "Enter migration message: " message; \
	uv run alembic revision --autogenerate -m "$$message"
	@echo "✅ Migration generated! Review the file in alembic/versions/"

migrate:
	@echo "Running database migrations with backup..."
	uv run python -m app.db.migration_runner
	@echo "✅ Migrations complete!"
