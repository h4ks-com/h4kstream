/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Response model for livestream token creation.
 */
export type LivestreamTokenResponse = {
  /**
   * JWT token for streaming authentication
   */
  token: string
  /**
   * ISO format expiration timestamp
   */
  expires_at: string
  /**
   * Maximum allowed streaming time in seconds
   */
  max_streaming_seconds: number
}
