/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PlaylistSongResult } from './PlaylistSongResult';
/**
 * Response after adding a playlist to the queue.
 */
export type PlaylistAddResponse = {
    /**
     * Successfully added songs
     */
    added?: Array<PlaylistSongResult>;
    /**
     * Per-song error messages
     */
    errors?: Array<string>;
    /**
     * Total number of songs added
     */
    total_added: number;
};

