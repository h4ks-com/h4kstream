.PHONY: fix fix-backend fix-e2e

fix: fix-backend fix-e2e

fix-backend:
	cd backend && pre-commit run --all

fix-e2e:
	cd e2e && pre-commit run --all

test-e2e:
	cd e2e && make test
