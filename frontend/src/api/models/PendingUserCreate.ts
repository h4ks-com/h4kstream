/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Model for creating a pending user token.
 */
export type PendingUserCreate = {
    email: string;
    duration_hours?: number;
    max_queue_songs?: number;
    max_add_requests?: number;
};

