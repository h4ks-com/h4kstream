/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Body_admin_add_song_admin_queue_add_post } from '../models/Body_admin_add_song_admin_queue_add_post';
import type { Body_admin_upload_show_intro_admin_shows__show_id__intro_post } from '../models/Body_admin_upload_show_intro_admin_shows__show_id__intro_post';
import type { Body_lookup_cache_by_hash_admin_cache_lookup_by_hash_post } from '../models/Body_lookup_cache_by_hash_admin_cache_lookup_by_hash_post';
import type { Body_update_user_role_admin_users__user_id__role_patch } from '../models/Body_update_user_role_admin_users__user_id__role_patch';
import type { Body_upload_transition_admin_transitions_upload_post } from '../models/Body_upload_transition_admin_transitions_upload_post';
import type { LivestreamTokenCreateRequest } from '../models/LivestreamTokenCreateRequest';
import type { LivestreamTokenResponse } from '../models/LivestreamTokenResponse';
import type { PendingUserCreate } from '../models/PendingUserCreate';
import type { PendingUserPublic } from '../models/PendingUserPublic';
import type { ShowCreate } from '../models/ShowCreate';
import type { ShowPublic } from '../models/ShowPublic';
import type { SongAddedResponse } from '../models/SongAddedResponse';
import type { SongItem } from '../models/SongItem';
import type { SongMetadataEditRequest } from '../models/SongMetadataEditRequest';
import type { SuccessResponse } from '../models/SuccessResponse';
import type { TokenCreateRequest } from '../models/TokenCreateRequest';
import type { TokenCreateResponse } from '../models/TokenCreateResponse';
import type { UserPublic } from '../models/UserPublic';
import type { UserUpdate } from '../models/UserUpdate';
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
     * List Cached Files
     * List all cached files with pagination and search
     * @param playlist Filter by playlist type
     * @param search Search in filename, origin_url, or reference_url
     * @param offset
     * @param limit
     * @param sort Sort field
     * @param order Sort order
     * @returns any Successful Response
     * @throws ApiError
     */
    public listCacheAdminCacheGet(
        playlist?: ('user' | 'fallback' | null),
        search?: (string | null),
        offset?: number,
        limit: number = 50,
        sort: string = 'added',
        order: string = 'desc',
    ): CancelablePromise<Record<string, any>> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/admin/cache',
            query: {
                'playlist': playlist,
                'search': search,
                'offset': offset,
                'limit': limit,
                'sort': sort,
                'order': order,
            },
            errors: {
                401: `Unauthorized`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * Bulk Delete Cache Entries
     * Delete multiple cache entries by ID, optionally deleting their files
     * @param requestBody
     * @param deleteFile Also delete the physical files
     * @returns any Successful Response
     * @throws ApiError
     */
    public bulkDeleteCacheAdminCacheDelete(
        requestBody: Array<number>,
        deleteFile: boolean = false,
    ): CancelablePromise<Record<string, any>> {
        return this.httpRequest.request({
            method: 'DELETE',
            url: '/admin/cache',
            query: {
                'delete_file': deleteFile,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Unauthorized`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * Delete Cache Entry
     * Delete a cache entry and optionally the file
     * @param cacheId
     * @param deleteFile Also delete the physical file
     * @returns SuccessResponse Successful Response
     * @throws ApiError
     */
    public deleteCacheAdminCacheCacheIdDelete(
        cacheId: number,
        deleteFile: boolean = false,
    ): CancelablePromise<SuccessResponse> {
        return this.httpRequest.request({
            method: 'DELETE',
            url: '/admin/cache/{cache_id}',
            path: {
                'cache_id': cacheId,
            },
            query: {
                'delete_file': deleteFile,
            },
            errors: {
                401: `Unauthorized`,
                404: `Cache entry not found`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * Admin Edit Song Metadata
     * Edit metadata of any song in user queue or fallback playlist. Updates both ID3 tags in the audio file and Redis cache. Admins can edit any song. Only MP3 files supported.
     * @param playlist
     * @param songId
     * @param requestBody
     * @returns SuccessResponse Successful Response
     * @throws ApiError
     */
    public adminEditSongMetadataAdminQueuePlaylistSongIdMetadataPatch(
        playlist: 'user' | 'fallback',
        songId: string,
        requestBody: SongMetadataEditRequest,
    ): CancelablePromise<SuccessResponse> {
        return this.httpRequest.request({
            method: 'PATCH',
            url: '/admin/queue/{playlist}/{song_id}/metadata',
            path: {
                'playlist': playlist,
                'song_id': songId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request or file format`,
                401: `Unauthorized`,
                404: `Song not found`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * Cache Statistics
     * Get cache statistics
     * @returns any Successful Response
     * @throws ApiError
     */
    public cacheStatsAdminCacheStatsGet(): CancelablePromise<Record<string, any>> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/admin/cache/stats',
            errors: {
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Stream Cached File
     * Stream a cached audio file by its ID
     * @param cacheId
     * @returns any Successful Response
     * @throws ApiError
     */
    public streamCacheFileAdminCacheCacheIdStreamGet(
        cacheId: number,
    ): CancelablePromise<any> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/admin/cache/{cache_id}/stream',
            path: {
                'cache_id': cacheId,
            },
            errors: {
                401: `Unauthorized`,
                404: `Cache entry or file not found`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * Lookup Cache Entries by File Hash
     * Upload a file to compute its MD5 and find matching cache entries. File is not stored.
     * @param formData
     * @returns any Successful Response
     * @throws ApiError
     */
    public lookupCacheByHashAdminCacheLookupByHashPost(
        formData: Body_lookup_cache_by_hash_admin_cache_lookup_by_hash_post,
    ): CancelablePromise<Record<string, any>> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/admin/cache/lookup-by-hash',
            formData: formData,
            mediaType: 'multipart/form-data',
            errors: {
                401: `Unauthorized`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Distinct Metadata Values
     * Get distinct titles and artists from cache_metadata for filter dropdowns
     * @returns any Successful Response
     * @throws ApiError
     */
    public cacheMetadataDistinctAdminCacheMetadataDistinctGet(): CancelablePromise<Record<string, any>> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/admin/cache/metadata/distinct',
            errors: {
                401: `Unauthorized`,
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
     * Update User Limits
     * Admin endpoint to update user limits (excludes role changes - use /admin/users/{user_id}/role for that).
     * @param userId
     * @param requestBody
     * @returns UserPublic Successful Response
     * @throws ApiError
     */
    public updateUserLimitsAdminUsersUserIdPatch(
        userId: string,
        requestBody: UserUpdate,
    ): CancelablePromise<UserPublic> {
        return this.httpRequest.request({
            method: 'PATCH',
            url: '/admin/users/{user_id}',
            path: {
                'user_id': userId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Unauthorized`,
                403: `Role changes not allowed in this endpoint`,
                404: `User not found`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * Update User Role
     * Update user role (admin TOKEN only - not available to role-based admins).
     * @param userId
     * @param requestBody
     * @returns UserPublic Successful Response
     * @throws ApiError
     */
    public updateUserRoleAdminUsersUserIdRolePatch(
        userId: string,
        requestBody: Body_update_user_role_admin_users__user_id__role_patch,
    ): CancelablePromise<UserPublic> {
        return this.httpRequest.request({
            method: 'PATCH',
            url: '/admin/users/{user_id}/role',
            path: {
                'user_id': userId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Unauthorized`,
                403: `Only admin tokens can change roles`,
                404: `User not found`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * Logout User
     * Admin endpoint to logout a user by deleting their refresh token.
     * @param userId
     * @returns boolean Successful Response
     * @throws ApiError
     */
    public logoutUserAdminUsersUserIdLogoutPost(
        userId: string,
    ): CancelablePromise<Record<string, boolean>> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/admin/users/{user_id}/logout',
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
    /**
     * Upload Show Intro Jingle (Admin)
     * Admin endpoint to upload a custom intro jingle for a show.
     * @param showId
     * @param formData
     * @returns ShowPublic Successful Response
     * @throws ApiError
     */
    public adminUploadShowIntroAdminShowsShowIdIntroPost(
        showId: number,
        formData: Body_admin_upload_show_intro_admin_shows__show_id__intro_post,
    ): CancelablePromise<ShowPublic> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/admin/shows/{show_id}/intro',
            path: {
                'show_id': showId,
            },
            formData: formData,
            mediaType: 'multipart/form-data',
            errors: {
                400: `Invalid file`,
                401: `Unauthorized`,
                404: `Show not found`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * Remove Show Intro Jingle (Admin)
     * Admin endpoint to remove a show's custom intro jingle.
     * @param showId
     * @returns SuccessResponse Successful Response
     * @throws ApiError
     */
    public adminRemoveShowIntroAdminShowsShowIdIntroDelete(
        showId: number,
    ): CancelablePromise<SuccessResponse> {
        return this.httpRequest.request({
            method: 'DELETE',
            url: '/admin/shows/{show_id}/intro',
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
    /**
     * Upload Jingle File
     * Upload an audio file for use as a jingle between MPD tracks (admin only)
     * @param formData
     * @returns SuccessResponse Successful Response
     * @throws ApiError
     */
    public uploadTransitionAdminTransitionsUploadPost(
        formData: Body_upload_transition_admin_transitions_upload_post,
    ): CancelablePromise<SuccessResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/admin/transitions/upload',
            formData: formData,
            mediaType: 'multipart/form-data',
            errors: {
                401: `Unauthorized`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * List Jingle Files
     * List all jingle files
     * @returns any Successful Response
     * @throws ApiError
     */
    public listTransitionsAdminTransitionsListGet(): CancelablePromise<any> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/admin/transitions/list',
            errors: {
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Stream Jingle File
     * Stream a jingle audio file
     * @param filename
     * @returns any Successful Response
     * @throws ApiError
     */
    public streamTransitionAdminTransitionsStreamFilenameGet(
        filename: string,
    ): CancelablePromise<any> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/admin/transitions/stream/{filename}',
            path: {
                'filename': filename,
            },
            errors: {
                401: `Unauthorized`,
                404: `File not found`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * Delete Jingle File
     * Delete a jingle audio file
     * @param filename
     * @returns SuccessResponse Successful Response
     * @throws ApiError
     */
    public deleteTransitionAdminTransitionsFilenameDelete(
        filename: string,
    ): CancelablePromise<SuccessResponse> {
        return this.httpRequest.request({
            method: 'DELETE',
            url: '/admin/transitions/{filename}',
            path: {
                'filename': filename,
            },
            errors: {
                401: `Unauthorized`,
                404: `File not found`,
                422: `Validation Error`,
            },
        });
    }
}
