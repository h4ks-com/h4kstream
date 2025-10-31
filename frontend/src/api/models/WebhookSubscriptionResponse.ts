/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Response model for webhook subscription creation.
 */
export type WebhookSubscriptionResponse = {
  /**
   * Unique webhook identifier
   */
  webhook_id: string
  /**
   * Webhook endpoint URL
   */
  url: string
  /**
   * Subscribed event types
   */
  events: Array<string>
  /**
   * Webhook description
   */
  description?: string | null
  /**
   * ISO format creation timestamp
   */
  created_at: string
}
