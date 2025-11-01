/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Recording metadata.
 */
export type RecordingMetadata = {
    /**
     * Recording ID
     */
    id: number;
    /**
     * ISO format creation timestamp
     */
    created_at: string;
    /**
     * Recording title
     */
    title?: (string | null);
    /**
     * Artist name
     */
    artist?: (string | null);
    /**
     * Genre
     */
    genre?: (string | null);
    /**
     * Description
     */
    description?: (string | null);
    /**
     * Duration in seconds
     */
    duration_seconds: number;
    /**
     * Relative URL to stream the recording
     */
    stream_url: string;
};

