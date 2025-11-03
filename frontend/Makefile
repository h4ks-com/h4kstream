.PHONY: check build install

install:
	@echo "Installing frontend dependencies..."
	npm install
	@echo "✅ Dependencies installed!"

check:
	@echo "Running TypeScript type checking..."
	npx tsc --noEmit
	@echo "✅ TypeScript checks passed!"

build:
	@echo "Building frontend..."
	npm run build
	@echo "✅ Build completed!"

test:
	@echo "Running frontend tests..."
	npm run test
	@echo "✅ Tests completed!"
