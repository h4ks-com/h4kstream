/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Body_add_song_queue_add_post } from '../models/Body_add_song_queue_add_post';
import type { SongAddedResponse } from '../models/SongAddedResponse';
import type { SongItem } from '../models/SongItem';
import type { SuccessResponse } from '../models/SuccessResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class QueueService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Add Song to User Queue
     * Add a song to your queue. Requires JWT token. Subject to limits: (1) max_queue_songs - simultaneous songs in queue, (2) max_add_requests - total lifetime add requests, (3) max_song_duration - song duration limit (30 min default), (4) max_file_size - file size limit (50MB default), (5) duplicate prevention - cannot add songs already in next 5 songs
     * @param formData
     * @returns SongAddedResponse Successful Response
     * @throws ApiError
     */
    public addSongQueueAddPost(
        formData?: Body_add_song_queue_add_post,
    ): CancelablePromise<SongAddedResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/queue/add',
            formData: formData,
            mediaType: 'multipart/form-data',
            errors: {
                400: `Invalid request or validation failed`,
                401: `Unauthorized`,
                403: `Queue limit or add request limit exceeded`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * List Queue Songs
     * Get songs in the queue (shared by all users). Returns user queue songs first, then fallback playlist songs. No authentication required.
     * @param limit Maximum number of songs to return (1-20)
     * @returns SongItem Successful Response
     * @throws ApiError
     */
    public listSongsQueueListGet(
        limit: number = 20,
    ): CancelablePromise<Array<SongItem>> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/queue/list',
            query: {
                'limit': limit,
            },
            errors: {
                400: `Invalid limit parameter`,
                401: `Unauthorized`,
                403: `Forbidden`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * Delete Song from User Queue
     * Delete a song from your queue. Requires JWT token (you can only delete your own songs). Note: Deleting a song does NOT decrease the total add request count - the max_add_requests limit persists regardless of deletions.
     * @param songId
     * @returns SuccessResponse Successful Response
     * @throws ApiError
     */
    public deleteSongQueueSongIdDelete(
        songId: string,
    ): CancelablePromise<SuccessResponse> {
        return this.httpRequest.request({
            method: 'DELETE',
            url: '/queue/{song_id}',
            path: {
                'song_id': songId,
            },
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Song not found`,
                422: `Validation Error`,
            },
        });
    }
}
