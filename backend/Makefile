.PHONY: fix check test

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
