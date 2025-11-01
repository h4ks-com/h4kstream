/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { NowPlayingMetadata } from './NowPlayingMetadata';
/**
 * Response for current playing track information.
 */
export type NowPlayingResponse = {
    /**
     * Current source: user, fallback, or livestream
     */
    source: string;
    /**
     * Track metadata
     */
    metadata: NowPlayingMetadata;
};

