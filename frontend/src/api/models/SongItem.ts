/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * MPD song queue item.
 */
export type SongItem = {
    /**
     * MPD queue ID
     */
    id: string;
    /**
     * File path in MPD
     */
    file: string;
    /**
     * Song title
     */
    title?: (string | null);
    /**
     * Song artist
     */
    artist?: (string | null);
    /**
     * Song album
     */
    album?: (string | null);
    /**
     * Song duration
     */
    time?: (string | null);
    /**
     * Position in queue
     */
    pos?: (string | null);
};

