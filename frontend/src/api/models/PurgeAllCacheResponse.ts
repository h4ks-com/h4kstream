/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Response after full cache purge.
 */
export type PurgeAllCacheResponse = {
    /**
     * Number of cache rows deleted
     */
    entries: number;
    /**
     * Number of files unlinked from disk
     */
    files: number;
};

