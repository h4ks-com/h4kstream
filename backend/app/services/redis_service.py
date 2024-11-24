import json

import redis.asyncio as redis


class RedisService:
    def __init__(self, redis_url: str):
        self.redis_url = redis_url
        self.redis = redis.from_url(self.redis_url)

    async def close(self):
        """Close the Redis connection."""
        await self.redis.close()

    async def set(self, key: str, value: dict, ttl: int = 3600):
        """Set a key-value pair in Redis with optional TTL.

        :param key: Redis key
        :param value: Dictionary value to store in Redis
        :param ttl: Time to live in seconds (default 1 hour)
        """
        await self.redis.setex(key, ttl, json.dumps(value))

    async def get(self, key: str) -> dict | None:
        """Get the value from Redis and return it as a dictionary.

        :param key: Redis key
        :return: Parsed dictionary or None
        """
        value = await self.redis.get(key)
        if value:
            return json.loads(value)
        return None

    async def delete(self, key: str):
        """Delete a key from Redis."""
        await self.redis.delete(key)

    async def set_user_song(self, user_id: str, song_data: dict):
        """Store a song in the Redis database associated with a user.

        :param user_id: The ID of the user adding the song
        :param song_data: Dictionary containing song data (e.g., title, URL)
        """
        await self.set(f"user:{user_id}:song", song_data)

    async def get_user_song(self, user_id: str) -> dict | None:
        """Retrieve a song associated with a user from Redis.

        :param user_id: The ID of the user
        :return: Song data or None if not found
        """
        return await self.get(f"user:{user_id}:song")

    async def clear_user_song(self, user_id: str):
        """Delete the song associated with a user from Redis."""
        await self.delete(f"user:{user_id}:song")
