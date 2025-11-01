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
