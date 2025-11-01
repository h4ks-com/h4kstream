/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { NowPlayingResponse } from '../models/NowPlayingResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class MetadataService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Get Now Playing
     * Get current playing track metadata (public endpoint)
     * @returns NowPlayingResponse Successful Response
     * @throws ApiError
     */
    public getNowPlayingMetadataNowGet(): CancelablePromise<NowPlayingResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/metadata/now',
        });
    }
}
