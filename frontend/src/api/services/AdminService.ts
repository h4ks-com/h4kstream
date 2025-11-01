/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Body_admin_add_song_admin_queue_add_post } from '../models/Body_admin_add_song_admin_queue_add_post';
import type { LivestreamTokenCreateRequest } from '../models/LivestreamTokenCreateRequest';
import type { LivestreamTokenResponse } from '../models/LivestreamTokenResponse';
import type { PendingUserCreate } from '../models/PendingUserCreate';
import type { PendingUserPublic } from '../models/PendingUserPublic';
import type { ShowCreate } from '../models/ShowCreate';
import type { ShowPublic } from '../models/ShowPublic';
import type { SongAddedResponse } from '../models/SongAddedResponse';
import type { SongItem } from '../models/SongItem';
import type { SuccessResponse } from '../models/SuccessResponse';
import type { TokenCreateRequest } from '../models/TokenCreateRequest';
import type { TokenCreateResponse } from '../models/TokenCreateResponse';
import type { UserPublic } from '../models/UserPublic';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class AdminService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Create JWT Token
     * Create a temporary JWT token with duration, queue limit, and total add request limit
     * @param requestBody
     * @returns TokenCreateResponse Successful Response
     * @throws ApiError
     */
    public createTokenAdminTokenPost(
        requestBody: TokenCreateRequest,
    ): CancelablePromise<TokenCreateResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/admin/token',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Unauthorized`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * Create Livestream Token
     * Create a livestream token. Auto-creates show if show_name provided and doesn't exist.
     * @param requestBody
     * @returns LivestreamTokenResponse Successful Response
     * @throws ApiError
     */
    public createLivestreamTokenAdminLivestreamTokenPost(
        requestBody: LivestreamTokenCreateRequest,
    ): CancelablePromise<LivestreamTokenResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/admin/livestream/token',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Unauthorized`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * Admin Add Song
     * Add a song to any playlist (user queue or fallback playlist). Bypasses all limits: queue limits, add request limits, duration limits, file size limits, and duplicate checks. Default: user queue
     * @param playlist Target playlist (user or fallback)
     * @param formData
     * @returns SongAddedResponse Successful Response
     * @throws ApiError
     */
    public adminAddSongAdminQueueAddPost(
        playlist: 'user' | 'fallback' = 'user',
        formData?: Body_admin_add_song_admin_queue_add_post,
    ): CancelablePromise<SongAddedResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/admin/queue/add',
            query: {
                'playlist': playlist,
            },
            formData: formData,
            mediaType: 'multipart/form-data',
            errors: {
                400: `Bad Request`,
                401: `Unauthorized`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * Admin List Songs
     * Get all songs in any playlist. Default: user queue
     * @param playlist Target playlist (user or fallback)
     * @returns SongItem Successful Response
     * @throws ApiError
     */
    public adminListSongsAdminQueueListGet(
        playlist: 'user' | 'fallback' = 'user',
    ): CancelablePromise<Array<SongItem>> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/admin/queue/list',
            query: {
                'playlist': playlist,
            },
            errors: {
                401: `Unauthorized`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * Admin Delete Song
     * Delete a specific song from any playlist. Default: user queue
     * @param songId
     * @param playlist Target playlist (user or fallback)
     * @returns SuccessResponse Successful Response
     * @throws ApiError
     */
    public adminDeleteSongAdminQueueSongIdDelete(
        songId: string,
        playlist: 'user' | 'fallback' = 'user',
    ): CancelablePromise<SuccessResponse> {
        return this.httpRequest.request({
            method: 'DELETE',
            url: '/admin/queue/{song_id}',
            path: {
                'song_id': songId,
            },
            query: {
                'playlist': playlist,
            },
            errors: {
                401: `Unauthorized`,
                404: `Song not found`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * Admin Clear Queue
     * Clear all songs from any playlist. Default: user queue
     * @param playlist Target playlist (user or fallback)
     * @returns SuccessResponse Successful Response
     * @throws ApiError
     */
    public adminClearQueueAdminQueueClearPost(
        playlist: 'user' | 'fallback' = 'user',
    ): CancelablePromise<SuccessResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/admin/queue/clear',
            query: {
                'playlist': playlist,
            },
            errors: {
                401: `Unauthorized`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * Admin Play
     * Start playback on any playlist. Default: user queue
     * @param playlist Target playlist (user or fallback)
     * @returns SuccessResponse Successful Response
     * @throws ApiError
     */
    public adminPlayAdminPlaybackPlayPost(
        playlist: 'user' | 'fallback' = 'user',
    ): CancelablePromise<SuccessResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/admin/playback/play',
            query: {
                'playlist': playlist,
            },
            errors: {
                400: `Invalid playlist`,
                401: `Unauthorized`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * Admin Pause
     * Pause playback on any playlist. Default: user queue
     * @param playlist Target playlist (user or fallback)
     * @returns SuccessResponse Successful Response
     * @throws ApiError
     */
    public adminPauseAdminPlaybackPausePost(
        playlist: 'user' | 'fallback' = 'user',
    ): CancelablePromise<SuccessResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/admin/playback/pause',
            query: {
                'playlist': playlist,
            },
            errors: {
                400: `Invalid playlist`,
                401: `Unauthorized`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * Admin Resume
     * Resume playback on any playlist. Default: user queue
     * @param playlist Target playlist (user or fallback)
     * @returns SuccessResponse Successful Response
     * @throws ApiError
     */
    public adminResumeAdminPlaybackResumePost(
        playlist: 'user' | 'fallback' = 'user',
    ): CancelablePromise<SuccessResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/admin/playback/resume',
            query: {
                'playlist': playlist,
            },
            errors: {
                400: `Invalid playlist`,
                401: `Unauthorized`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * Delete Recording
     * Delete a livestream recording (file and database entry)
     * @param recordingId
     * @returns SuccessResponse Successful Response
     * @throws ApiError
     */
    public deleteRecordingAdminRecordingsRecordingIdDelete(
        recordingId: number,
    ): CancelablePromise<SuccessResponse> {
        return this.httpRequest.request({
            method: 'DELETE',
            url: '/admin/recordings/{recording_id}',
            path: {
                'recording_id': recordingId,
            },
            errors: {
                401: `Unauthorized`,
                404: `Recording not found`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * Create Pending User Token
     * Admin endpoint to generate a signup token for a new user.
     * @param requestBody
     * @returns PendingUserPublic Successful Response
     * @throws ApiError
     */
    public createPendingUserAdminUsersPendingPost(
        requestBody: PendingUserCreate,
    ): CancelablePromise<PendingUserPublic> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/admin/users/pending',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Unauthorized`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * List All Users
     * Admin endpoint to list all users.
     * @param skip
     * @param limit
     * @returns UserPublic Successful Response
     * @throws ApiError
     */
    public listUsersAdminUsersGet(
        skip?: number,
        limit: number = 100,
    ): CancelablePromise<Array<UserPublic>> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/admin/users/',
            query: {
                'skip': skip,
                'limit': limit,
            },
            errors: {
                401: `Unauthorized`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get User by ID
     * Admin endpoint to get a specific user.
     * @param userId
     * @returns UserPublic Successful Response
     * @throws ApiError
     */
    public getUserAdminUsersUserIdGet(
        userId: string,
    ): CancelablePromise<UserPublic> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/admin/users/{user_id}',
            path: {
                'user_id': userId,
            },
            errors: {
                401: `Unauthorized`,
                404: `User not found`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * Delete User
     * Admin endpoint to delete a user.
     * @param userId
     * @returns boolean Successful Response
     * @throws ApiError
     */
    public deleteUserAdminUsersUserIdDelete(
        userId: string,
    ): CancelablePromise<Record<string, boolean>> {
        return this.httpRequest.request({
            method: 'DELETE',
            url: '/admin/users/{user_id}',
            path: {
                'user_id': userId,
            },
            errors: {
                401: `Unauthorized`,
                404: `User not found`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * List All Shows
     * Admin endpoint to list all shows.
     * @param skip
     * @param limit
     * @returns ShowPublic Successful Response
     * @throws ApiError
     */
    public adminListShowsAdminShowsGet(
        skip?: number,
        limit: number = 100,
    ): CancelablePromise<Array<ShowPublic>> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/admin/shows/',
            query: {
                'skip': skip,
                'limit': limit,
            },
            errors: {
                401: `Unauthorized`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * Create Show (Admin)
     * Admin endpoint to create a show without requiring an owner.
     * @param requestBody
     * @returns ShowPublic Successful Response
     * @throws ApiError
     */
    public adminCreateShowAdminShowsPost(
        requestBody: ShowCreate,
    ): CancelablePromise<ShowPublic> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/admin/shows/',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Show name already exists`,
                401: `Unauthorized`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Show by ID
     * Admin endpoint to get any show.
     * @param showId
     * @returns ShowPublic Successful Response
     * @throws ApiError
     */
    public adminGetShowAdminShowsShowIdGet(
        showId: number,
    ): CancelablePromise<ShowPublic> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/admin/shows/{show_id}',
            path: {
                'show_id': showId,
            },
            errors: {
                401: `Unauthorized`,
                404: `Show not found`,
                422: `Validation Error`,
            },
        });
    }
}
