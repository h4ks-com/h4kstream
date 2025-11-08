"""Shared type definitions for the application."""

from typing import Literal

# Playlist types - user-friendly naming
PlaylistType = Literal["user", "fallback"]

# Source types - includes livestream
SourceType = Literal["livestream", "user", "fallback"]

# Playback control actions
PlaybackAction = Literal["play", "pause", "resume"]
