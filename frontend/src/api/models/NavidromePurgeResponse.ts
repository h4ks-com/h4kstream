/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Response after purging Navidrome cache entries.
 */
export type NavidromePurgeResponse = {
    /**
     * Number of cache entries deleted
     */
    purged: number;
    /**
     * Number of songs looked up from Navidrome
     */
    songs_checked: number;
};

