/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PlaylistSource } from './PlaylistSource';
/**
 * Request to add a playlist to the user queue.
 */
export type PlaylistAddRequest = {
    /**
     * Playlist source (e.g. navidrome)
     */
    source: PlaylistSource;
    /**
     * ID of the playlist to add
     */
    playlist_id: string;
};

