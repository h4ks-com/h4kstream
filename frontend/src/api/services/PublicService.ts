/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ClientCountsResponse } from '../models/ClientCountsResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class PublicService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Get Client Counts
     * Get current listener counts from all sources (Icecast harbor output and Janus WebRTC). Returns separate counts for each source and combined total. Always available (public endpoint, no authentication required).
     * @returns ClientCountsResponse Successful Response
     * @throws ApiError
     */
    public getClientCountsPublicClientsGet(): CancelablePromise<ClientCountsResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/public/clients',
        });
    }
    /**
     * Get Live Stream Clip
     * Return an MP3 clip of the recent live radio output. Offsets are seconds measured backwards from the live edge: `start_offset` is the older bound, `end_offset` the newer bound. For example `start_offset=300&end_offset=10` returns audio from 5 minutes ago up to 10 seconds ago. The buffer holds the last few minutes only, so the clip reflects whatever is live at request time. No authentication required.
     * @param startOffset Older bound, seconds before live edge (max 300)
     * @param endOffset Newer bound, seconds before live edge
     * @returns any MP3 audio clip
     * @throws ApiError
     */
    public getStreamClipPublicClipGet(
        startOffset: number = 300,
        endOffset?: number,
    ): CancelablePromise<any> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/public/clip',
            query: {
                'start_offset': startOffset,
                'end_offset': endOffset,
            },
            errors: {
                400: `Invalid clip window`,
                422: `Validation Error`,
                503: `Clip buffer unavailable`,
            },
        });
    }
}
