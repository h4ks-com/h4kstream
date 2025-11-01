/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Webhook delivery statistics.
 */
export type WebhookStats = {
    /**
     * Webhook identifier
     */
    webhook_id: string;
    /**
     * Total delivery attempts
     */
    total_deliveries: number;
    /**
     * Successful deliveries
     */
    success_count: number;
    /**
     * Failed deliveries
     */
    failure_count: number;
    /**
     * Success rate (0.0-1.0)
     */
    success_rate: number;
    /**
     * ISO format timestamp of last delivery attempt
     */
    last_delivery?: (string | null);
};

