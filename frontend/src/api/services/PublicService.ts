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
}
