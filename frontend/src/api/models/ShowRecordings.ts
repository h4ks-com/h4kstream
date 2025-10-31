/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { RecordingMetadata } from './RecordingMetadata'
/**
 * Recordings grouped by show name.
 */
export type ShowRecordings = {
  /**
   * Show name
   */
  show_name: string
  /**
   * List of recordings for this show
   */
  recordings: Array<RecordingMetadata>
}
