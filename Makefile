.PHONY: fix fix-backend

fix: fix-backend

fix-backend:
	cd backend && pre-commit run --all