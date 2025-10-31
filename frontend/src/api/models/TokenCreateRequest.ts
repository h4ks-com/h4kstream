/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Request model for creating JWT tokens.
 */
export type TokenCreateRequest = {
  /**
   * Token validity duration in seconds (max 1 day)
   */
  duration_seconds: number
  /**
   * Maximum songs allowed in queue simultaneously
   */
  max_queue_songs?: number | null
  /**
   * Total number of times user can invoke add endpoint (lifetime limit, persists after deletes)
   */
  max_add_requests?: number | null
}
