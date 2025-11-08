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
    source: NowPlayingResponse.source;
    /**
     * Track metadata
     */
    metadata: NowPlayingMetadata;
};
export namespace NowPlayingResponse {
    /**
     * Current source: user, fallback, or livestream
     */
    export enum source {
        LIVESTREAM = 'livestream',
        USER = 'user',
        FALLBACK = 'fallback',
    }
}

