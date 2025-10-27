.PHONY: fix check test

fix:
	@echo "Running ruff check and fix..."
	uv run ruff check --fix app/
	@echo "Running ruff format..."
	uv run ruff format app/
	@echo "✅ All fixes applied!"

check:
	@echo "Running ruff check..."
	uv run ruff check app/
	@echo "Running mypy..."
	uv run mypy app/
	@echo "✅ All checks passed!"

test:
	@echo "Running tests in parallel..."
	uv run pytest -n auto
	@echo "✅ Tests completed!"
