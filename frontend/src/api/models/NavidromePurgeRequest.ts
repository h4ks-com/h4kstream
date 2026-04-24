/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Request to purge cache entries for a Navidrome playlist or album.
 */
export type NavidromePurgeRequest = {
    /**
     * 'playlist' or 'album'
     */
    source: NavidromePurgeRequest.source;
    /**
     * Navidrome playlist or album ID
     */
    id: string;
};
export namespace NavidromePurgeRequest {
    /**
     * 'playlist' or 'album'
     */
    export enum source {
        PLAYLIST = 'playlist',
        ALBUM = 'album',
    }
}

