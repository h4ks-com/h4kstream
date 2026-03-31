/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * A Navidrome playlist available to add to the queue.
 */
export type NavidromePlaylistItem = {
    /**
     * Navidrome playlist ID
     */
    id: string;
    /**
     * Playlist name
     */
    name: string;
    /**
     * Number of songs in the playlist
     */
    song_count: number;
    /**
     * Playlist comment/description
     */
    comment?: string;
    /**
     * Whether the playlist is public
     */
    public?: boolean;
};

