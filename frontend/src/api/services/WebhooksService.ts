/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { SuccessResponse } from '../models/SuccessResponse'
import type { WebhookDelivery } from '../models/WebhookDelivery'
import type { WebhookStats } from '../models/WebhookStats'
import type { WebhookSubscription } from '../models/WebhookSubscription'
import type { WebhookSubscriptionRequest } from '../models/WebhookSubscriptionRequest'
import type { WebhookSubscriptionResponse } from '../models/WebhookSubscriptionResponse'
import type { CancelablePromise } from '../core/CancelablePromise'
import type { BaseHttpRequest } from '../core/BaseHttpRequest'
export class WebhooksService {
  constructor(public readonly httpRequest: BaseHttpRequest) {}
  /**
   * Subscribe Webhook
   * Create a webhook subscription to receive POST notifications for specified events
   * @param requestBody
   * @returns WebhookSubscriptionResponse Successful Response
   * @throws ApiError
   */
  public subscribeWebhookAdminWebhooksSubscribePost(
    requestBody: WebhookSubscriptionRequest
  ): CancelablePromise<WebhookSubscriptionResponse> {
    return this.httpRequest.request({
      method: 'POST',
      url: '/admin/webhooks/subscribe',
      body: requestBody,
      mediaType: 'application/json',
      errors: {
        400: `Bad Request`,
        401: `Unauthorized`,
        422: `Validation Error`,
      },
    })
  }
  /**
   * List Webhooks
   * Get all webhook subscriptions (without sensitive signing keys)
   * @returns WebhookSubscription Successful Response
   * @throws ApiError
   */
  public listWebhooksAdminWebhooksListGet(): CancelablePromise<
    Array<WebhookSubscription>
  > {
    return this.httpRequest.request({
      method: 'GET',
      url: '/admin/webhooks/list',
      errors: {
        401: `Unauthorized`,
      },
    })
  }
  /**
   * Delete Webhook
   * Remove webhook subscription and stop receiving notifications
   * @param webhookId
   * @returns SuccessResponse Successful Response
   * @throws ApiError
   */
  public unsubscribeWebhookAdminWebhooksWebhookIdDelete(
    webhookId: string
  ): CancelablePromise<SuccessResponse> {
    return this.httpRequest.request({
      method: 'DELETE',
      url: '/admin/webhooks/{webhook_id}',
      path: {
        webhook_id: webhookId,
      },
      errors: {
        401: `Unauthorized`,
        404: `Webhook not found`,
        422: `Validation Error`,
      },
    })
  }
  /**
   * Get Delivery History
   * View recent webhook delivery attempts (last 7 days, up to 100 entries)
   * @param webhookId
   * @param limit
   * @returns WebhookDelivery Successful Response
   * @throws ApiError
   */
  public getWebhookDeliveriesAdminWebhooksWebhookIdDeliveriesGet(
    webhookId: string,
    limit: number = 100
  ): CancelablePromise<Array<WebhookDelivery>> {
    return this.httpRequest.request({
      method: 'GET',
      url: '/admin/webhooks/{webhook_id}/deliveries',
      path: {
        webhook_id: webhookId,
      },
      query: {
        limit: limit,
      },
      errors: {
        401: `Unauthorized`,
        404: `Webhook not found`,
        422: `Validation Error`,
      },
    })
  }
  /**
   * Get Webhook Statistics
   * Get aggregated delivery statistics for a webhook
   * @param webhookId
   * @returns WebhookStats Successful Response
   * @throws ApiError
   */
  public getWebhookStatsAdminWebhooksWebhookIdStatsGet(
    webhookId: string
  ): CancelablePromise<WebhookStats> {
    return this.httpRequest.request({
      method: 'GET',
      url: '/admin/webhooks/{webhook_id}/stats',
      path: {
        webhook_id: webhookId,
      },
      errors: {
        401: `Unauthorized`,
        404: `Webhook not found`,
        422: `Validation Error`,
      },
    })
  }
  /**
   * Test Webhook
   * Send a test event to webhook to verify it's reachable and signature verification works
   * @param webhookId
   * @returns SuccessResponse Successful Response
   * @throws ApiError
   */
  public testWebhookAdminWebhooksWebhookIdTestPost(
    webhookId: string
  ): CancelablePromise<SuccessResponse> {
    return this.httpRequest.request({
      method: 'POST',
      url: '/admin/webhooks/{webhook_id}/test',
      path: {
        webhook_id: webhookId,
      },
      errors: {
        400: `Webhook delivery failed`,
        401: `Unauthorized`,
        404: `Webhook not found`,
        422: `Validation Error`,
      },
    })
  }
}
