/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Response model for token refresh.
 */
export type TokenRefreshResponse = {
    /**
     * New JWT bearer token
     */
    token: string;
    /**
     * New refresh token
     */
    refresh_token: string;
};

