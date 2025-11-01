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
    max_streaming_seconds: number;
    /**
     * Optional show identifier (validates ownership if provided)
     */
    show_name?: (string | null);
    /**
     * Minimum duration in seconds to keep recording (default 60)
     */
    min_recording_duration?: number;
};

