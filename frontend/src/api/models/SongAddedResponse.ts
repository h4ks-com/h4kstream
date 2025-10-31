/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Response for song addition with song ID.
 */
export type SongAddedResponse = {
  /**
   * Operation status
   */
  status?: string
  /**
   * Prefixed song ID (u-{id} for user, f-{id} for fallback)
   */
  song_id: string
}
