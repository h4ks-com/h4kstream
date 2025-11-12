/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Request for editing song metadata (ID3 tags, Redis cache, and FileCache).
 */
export type SongMetadataEditRequest = {
    /**
     * Song title
     */
    title?: (string | null);
    /**
     * Artist name
     */
    artist?: (string | null);
    /**
     * Album name
     */
    album?: (string | null);
    /**
     * Music genre
     */
    genre?: (string | null);
    /**
     * Reference URL for user-facing link
     */
    reference_url?: (string | null);
};

