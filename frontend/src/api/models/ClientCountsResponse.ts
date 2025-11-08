/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Response for current client/listener counts from all sources.
 */
export type ClientCountsResponse = {
    /**
     * Current Icecast (harbor output) listener count
     */
    icecast: number;
    /**
     * Current WebRTC (Janus) viewer count
     */
    webrtc: number;
    /**
     * Combined total listener count
     */
    total: number;
};

