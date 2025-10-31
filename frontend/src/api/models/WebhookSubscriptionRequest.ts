/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Request model for creating webhook subscriptions.
 */
export type WebhookSubscriptionRequest = {
  /**
   * Webhook endpoint URL (will receive POST requests)
   */
  url: string
  /**
   * Event types to subscribe to: song_changed, livestream_started, livestream_ended, queue_switched
   */
  events: Array<string>
  /**
   * Secret key for HMAC signature verification (min 16 chars)
   */
  signing_key: string
  /**
   * Optional description of webhook purpose
   */
  description?: string | null
}
