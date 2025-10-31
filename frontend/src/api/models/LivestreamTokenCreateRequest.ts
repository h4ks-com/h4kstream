/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Request model for creating livestream tokens.
 */
export type LivestreamTokenCreateRequest = {
  /**
   * Maximum streaming time in seconds (1 min to 24 hours)
   */
  max_streaming_seconds: number
  /**
   * Unique identifier for the show (default: livestream)
   */
  show_name?: string
  /**
   * Minimum duration in seconds to keep recording (default 60)
   */
  min_recording_duration?: number
}
