/**
 * JWT token utilities for parsing and extracting claims
 */

interface JWTPayload {
  user_id: string;
  max_queue_songs?: number;
  max_add_requests?: number;
  role?: string;
  exp?: number;
  [key: string]: any;
}

/**
 * Decode JWT token payload without validation
 * NOTE: This does NOT verify the signature - only used for reading claims
 */
export function decodeJWT(token: string): JWTPayload | null {
  try {
    // JWT format: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    // Decode the payload (second part)
    const payload = parts[1];

    // Replace URL-safe characters
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');

    // Decode base64
    const jsonString = atob(base64);

    // Parse JSON
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Failed to decode JWT:', error);
    return null;
  }
}

/**
 * Extract user limits from JWT token
 */
export function getUserLimits(token: string): {
  maxQueueSongs: number | null;
  maxAddRequests: number | null;
} {
  const payload = decodeJWT(token);

  return {
    maxQueueSongs: payload?.max_queue_songs ?? null,
    maxAddRequests: payload?.max_add_requests ?? null,
  };
}

/**
 * Get token expiry timestamp (Unix timestamp in seconds)
 */
export function getTokenExpiry(token: string): number | null {
  const payload = decodeJWT(token);
  return payload?.exp ?? null;
}

/**
 * Get remaining time until token expires (in seconds)
 */
export function getTokenTimeRemaining(token: string): number {
  const expiry = getTokenExpiry(token);
  if (!expiry) {
    return 0;
  }

  const now = Math.floor(Date.now() / 1000);
  const remaining = expiry - now;

  return Math.max(0, remaining);
}

/**
 * Format seconds into a human-readable string (e.g., "45m 30s")
 */
export function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) {
    return 'Expired';
  }

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;

  if (minutes === 0) {
    return `${secs}s`;
  }

  return `${minutes}m ${secs}s`;
}

/**
 * Extract role from JWT token
 */
export function getUserRole(token: string): string {
  const payload = decodeJWT(token);
  return payload?.role ?? '';
}
