/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { LivestreamTokenCreateRequest } from '../models/LivestreamTokenCreateRequest';
import type { LivestreamTokenResponse } from '../models/LivestreamTokenResponse';
import type { ShowCreate } from '../models/ShowCreate';
import type { ShowPublic } from '../models/ShowPublic';
import type { ShowUpdate } from '../models/ShowUpdate';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class ShowsService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * List User's Shows
     * List all shows owned by the authenticated user.
     * @param skip
     * @param limit
     * @returns ShowPublic Successful Response
     * @throws ApiError
     */
    public listUserShowsShowsGet(
        skip?: number,
        limit: number = 100,
    ): CancelablePromise<Array<ShowPublic>> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/shows/',
            query: {
                'skip': skip,
                'limit': limit,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Show
     * Get a specific show owned by the authenticated user.
     * @param showId
     * @returns ShowPublic Successful Response
     * @throws ApiError
     */
    public getShowShowsShowIdGet(
        showId: number,
    ): CancelablePromise<ShowPublic> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/shows/{show_id}',
            path: {
                'show_id': showId,
            },
            errors: {
                404: `Show not found`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * Update Show
     * Update a show owned by the authenticated user.
     * @param showId
     * @param requestBody
     * @returns ShowPublic Successful Response
     * @throws ApiError
     */
    public updateShowShowsShowIdPatch(
        showId: number,
        requestBody: ShowUpdate,
    ): CancelablePromise<ShowPublic> {
        return this.httpRequest.request({
            method: 'PATCH',
            url: '/shows/{show_id}',
            path: {
                'show_id': showId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                404: `Show not found`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * Delete Show
     * Delete a show owned by the authenticated user.
     * @param showId
     * @returns boolean Successful Response
     * @throws ApiError
     */
    public deleteShowShowsShowIdDelete(
        showId: number,
    ): CancelablePromise<Record<string, boolean>> {
        return this.httpRequest.request({
            method: 'DELETE',
            url: '/shows/{show_id}',
            path: {
                'show_id': showId,
            },
            errors: {
                404: `Show not found`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * Create Livestream Token for Show
     * Create a livestream token for a show owned by the authenticated user.
     * @param showId
     * @param requestBody
     * @returns LivestreamTokenResponse Successful Response
     * @throws ApiError
     */
    public createShowLivestreamTokenShowsShowIdLivestreamTokenPost(
        showId: number,
        requestBody: LivestreamTokenCreateRequest,
    ): CancelablePromise<LivestreamTokenResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/shows/{show_id}/livestream/token',
            path: {
                'show_id': showId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                403: `Not authorized`,
                404: `Show not found`,
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
