/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Body_add_song_queue_add_post } from '../models/Body_add_song_queue_add_post';
import type { NavidromeAlbumItem } from '../models/NavidromeAlbumItem';
import type { NavidromePlaylistItem } from '../models/NavidromePlaylistItem';
import type { PlaylistAddRequest } from '../models/PlaylistAddRequest';
import type { PlaylistAddResponse } from '../models/PlaylistAddResponse';
import type { SongAddedResponse } from '../models/SongAddedResponse';
import type { SongItem } from '../models/SongItem';
import type { SongMetadataEditRequest } from '../models/SongMetadataEditRequest';
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
     * Get songs in the queue (shared by all users). Returns user queue songs first, then fallback playlist songs. Optional filter to show only songs belonging to authenticated user. No authentication required unless user_only=true. Accepts both admin tokens and user JWT tokens.
     * @param limit Maximum number of songs to return (1-20)
     * @param userOnly Filter to show only user's own songs (requires authentication)
     * @returns SongItem Successful Response
     * @throws ApiError
     */
    public listSongsQueueListGet(
        limit: number = 20,
        userOnly: boolean = false,
    ): CancelablePromise<Array<SongItem>> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/queue/list',
            query: {
                'limit': limit,
                'user_only': userOnly,
            },
            errors: {
                400: `Invalid limit parameter`,
                401: `Authentication required when user_only=true`,
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
    /**
     * Edit Song Metadata
     * Edit metadata of your own uploaded song. Updates both ID3 tags in the audio file and Redis cache. Users can only edit their own songs. Only MP3 files supported.
     * @param songId
     * @param requestBody
     * @returns SuccessResponse Successful Response
     * @throws ApiError
     */
    public editSongMetadataQueueSongIdMetadataPatch(
        songId: string,
        requestBody: SongMetadataEditRequest,
    ): CancelablePromise<SuccessResponse> {
        return this.httpRequest.request({
            method: 'PATCH',
            url: '/queue/{song_id}/metadata',
            path: {
                'song_id': songId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request or file format`,
                401: `Unauthorized`,
                403: `Not authorized to edit this song`,
                404: `Song not found`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * List Navidrome Playlists
     * List Navidrome playlists visible to the caller. Authenticated users see their own playlists plus public ones. Unauthenticated requests (or users without a Navidrome account) see only public playlists.
     * @returns NavidromePlaylistItem Successful Response
     * @throws ApiError
     */
    public listNavidromePlaylistsQueuePlaylistsNavidromeGet(): CancelablePromise<Array<NavidromePlaylistItem>> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/queue/playlists/navidrome',
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
                503: `Service Unavailable`,
            },
        });
    }
    /**
     * Search Navidrome Albums
     * Search albums in Navidrome by name or artist. Returns up to 20 results.
     * @param query
     * @returns NavidromeAlbumItem Successful Response
     * @throws ApiError
     */
    public searchNavidromeAlbumsQueueAlbumsNavidromeSearchGet(
        query: string,
    ): CancelablePromise<Array<NavidromeAlbumItem>> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/queue/albums/navidrome/search',
            query: {
                'query': query,
            },
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
                422: `Validation Error`,
                503: `Service Unavailable`,
            },
        });
    }
    /**
     * Add Playlist to Queue
     * Add a playlist (from Navidrome or other sources) to your user queue. Entire playlist is rejected if adding it would exceed your queue limit.
     * @param requestBody
     * @returns PlaylistAddResponse Successful Response
     * @throws ApiError
     */
    public addPlaylistQueueAddPlaylistPost(
        requestBody: PlaylistAddRequest,
    ): CancelablePromise<PlaylistAddResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/queue/add-playlist',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                401: `Unauthorized`,
                403: `Queue limit exceeded`,
                422: `Validation Error`,
                503: `Service Unavailable`,
            },
        });
    }
}
