/**
 * JWT token utilities for parsing and extracting claims
 */

interface JWTPayload {
  user_id: string;
  max_queue_songs?: number;
  max_add_requests?: number;
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
