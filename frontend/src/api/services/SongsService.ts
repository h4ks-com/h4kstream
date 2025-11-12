/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class SongsService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Stream Cached Song
     * Stream an audio file from the file cache by cache ID. Used as fallback when reference_url is not available. Returns the audio file with appropriate Content-Type headers.
     * @param cacheId
     * @returns any Audio file stream
     * @throws ApiError
     */
    public streamSongSongsStreamCacheIdGet(
        cacheId: number,
    ): CancelablePromise<any> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/songs/stream/{cache_id}',
            path: {
                'cache_id': cacheId,
            },
            errors: {
                404: `Cache entry or file not found`,
                422: `Validation Error`,
            },
        });
    }
}
