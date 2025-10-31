/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BaseHttpRequest } from './core/BaseHttpRequest'
import type { OpenAPIConfig } from './core/OpenAPI'
import { FetchHttpRequest } from './core/FetchHttpRequest'
import { AdminService } from './services/AdminService'
import { DefaultService } from './services/DefaultService'
import { MetadataService } from './services/MetadataService'
import { QueueService } from './services/QueueService'
import { RecordingsService } from './services/RecordingsService'
import { WebhooksService } from './services/WebhooksService'
type HttpRequestConstructor = new (config: OpenAPIConfig) => BaseHttpRequest
export class ApiClient {
  public readonly admin: AdminService
  public readonly default: DefaultService
  public readonly metadata: MetadataService
  public readonly queue: QueueService
  public readonly recordings: RecordingsService
  public readonly webhooks: WebhooksService
  public readonly request: BaseHttpRequest
  constructor(
    config?: Partial<OpenAPIConfig>,
    HttpRequest: HttpRequestConstructor = FetchHttpRequest
  ) {
    this.request = new HttpRequest({
      BASE: config?.BASE ?? '/api',
      VERSION: config?.VERSION ?? '1.0.0',
      WITH_CREDENTIALS: config?.WITH_CREDENTIALS ?? false,
      CREDENTIALS: config?.CREDENTIALS ?? 'include',
      TOKEN: config?.TOKEN,
      USERNAME: config?.USERNAME,
      PASSWORD: config?.PASSWORD,
      HEADERS: config?.HEADERS,
      ENCODE_PATH: config?.ENCODE_PATH,
    })
    this.admin = new AdminService(this.request)
    this.default = new DefaultService(this.request)
    this.metadata = new MetadataService(this.request)
    this.queue = new QueueService(this.request)
    this.recordings = new RecordingsService(this.request)
    this.webhooks = new WebhooksService(this.request)
  }
}
