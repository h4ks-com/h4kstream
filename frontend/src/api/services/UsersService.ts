/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PendingUserCreate } from '../models/PendingUserCreate';
import type { PendingUserPublic } from '../models/PendingUserPublic';
import type { TokenCreateResponse } from '../models/TokenCreateResponse';
import type { UserCreate } from '../models/UserCreate';
import type { UserLogin } from '../models/UserLogin';
import type { UserPublic } from '../models/UserPublic';
import type { UserUpdate } from '../models/UserUpdate';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class UsersService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Register New User
     * Register a new user with a valid pending user token.
     * @param signupToken Pending user signup token
     * @param requestBody
     * @returns TokenCreateResponse Successful Response
     * @throws ApiError
     */
    public registerUserUsersRegisterPost(
        signupToken: string,
        requestBody: UserCreate,
    ): CancelablePromise<TokenCreateResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/users/register',
            query: {
                'signup_token': signupToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid token or user already exists`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * User Login
     * Login with email and password to receive a JWT token.
     * @param requestBody
     * @returns TokenCreateResponse Successful Response
     * @throws ApiError
     */
    public loginUserUsersLoginPost(
        requestBody: UserLogin,
    ): CancelablePromise<TokenCreateResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/users/login',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Invalid credentials`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Current User
     * Get the current authenticated user's information.
     * @returns UserPublic Successful Response
     * @throws ApiError
     */
    public getCurrentUserUsersMeGet(): CancelablePromise<UserPublic> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/users/me',
        });
    }
    /**
     * Update Current User
     * Update the current authenticated user's information.
     * @param requestBody
     * @returns UserPublic Successful Response
     * @throws ApiError
     */
    public updateCurrentUserUsersMePatch(
        requestBody: UserUpdate,
    ): CancelablePromise<UserPublic> {
        return this.httpRequest.request({
            method: 'PATCH',
            url: '/users/me',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
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
}
