# h4kstream

h4ks online radio streaming server with a web interface.

# Docker Compose setup:

For development:

```sh
docker compose down; docker compose --profile dev build; docker compose --profile dev up
```

For production:

```sh
docker compose down; docker compose build; docker compose up -d
```

# Development

Run the stack in background in dev mode:

```sh
make run-dev
```

Edit code for backend and frontend as needed. The backend will automatically hot-reload. Rebuild the backend and frontend api client to get the latest changes:

```sh
make frontend-build
```

Check and create tests for new features. Run tests:

```sh
make test-all
```
