/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Webhook delivery attempt log.
 */
export type WebhookDelivery = {
  /**
   * Webhook identifier
   */
  webhook_id: string
  /**
   * Event type delivered
   */
  event_type: string
  /**
   * Destination URL
   */
  url: string
  /**
   * Delivery status: success or failed
   */
  status: string
  /**
   * HTTP status code (if request succeeded)
   */
  status_code?: number | null
  /**
   * Error message (if delivery failed)
   */
  error?: string | null
  /**
   * ISO format delivery timestamp
   */
  timestamp: string
}
