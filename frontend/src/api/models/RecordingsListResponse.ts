/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ShowRecordings } from './ShowRecordings';
/**
 * Response for recordings list with pagination.
 */
export type RecordingsListResponse = {
    /**
     * Recordings grouped by show
     */
    shows: Array<ShowRecordings>;
    /**
     * Total number of shows
     */
    total_shows: number;
    /**
     * Total number of recordings
     */
    total_recordings: number;
    /**
     * Current page number
     */
    page: number;
    /**
     * Page size
     */
    page_size: number;
};

