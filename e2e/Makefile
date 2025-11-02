.PHONY: fix check test

fix:
	pre-commit run --all-files

check:
	@echo "Running ruff check..."
	uv run ruff check tests/
	@echo "Running mypy..."
	uv run mypy tests/
	@echo "✅ All checks passed!"

test:
	uv run pytest -v
