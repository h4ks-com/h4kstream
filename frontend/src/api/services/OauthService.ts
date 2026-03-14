/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class OauthService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * OAuth Login Status
     * @returns any Successful Response
     * @throws ApiError
     */
    public oauthStatusUsersOauthStatusGet(): CancelablePromise<Record<string, any>> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/users/oauth/status',
        });
    }
    /**
     * Initiate OAuth Login
     * @returns any Successful Response
     * @throws ApiError
     */
    public oauthLoginUsersOauthLoginGet(): CancelablePromise<any> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/users/oauth/login',
        });
    }
    /**
     * OAuth Callback
     * @param code
     * @param state
     * @returns any Successful Response
     * @throws ApiError
     */
    public oauthCallbackUsersOauthCallbackGet(
        code: string,
        state: string,
    ): CancelablePromise<any> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/users/oauth/callback',
            query: {
                'code': code,
                'state': state,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
}
