/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { RecordingsListResponse } from '../models/RecordingsListResponse'
import type { CancelablePromise } from '../core/CancelablePromise'
import type { BaseHttpRequest } from '../core/BaseHttpRequest'
export class RecordingsService {
  constructor(public readonly httpRequest: BaseHttpRequest) {}
  /**
   * List Recordings
   * List and search livestream recordings with filters and pagination
   * @param showName Filter by show name (exact match)
   * @param search Search in title, artist, genre, description
   * @param genre Filter by genre (exact match)
   * @param dateFrom Filter by date from (ISO format)
   * @param dateTo Filter by date to (ISO format)
   * @param page Page number (1-based)
   * @param pageSize Page size (max 100)
   * @returns RecordingsListResponse Successful Response
   * @throws ApiError
   */
  public listRecordingsRecordingsListGet(
    showName?: string | null,
    search?: string | null,
    genre?: string | null,
    dateFrom?: string | null,
    dateTo?: string | null,
    page: number = 1,
    pageSize: number = 20
  ): CancelablePromise<RecordingsListResponse> {
    return this.httpRequest.request({
      method: 'GET',
      url: '/recordings/list',
      query: {
        show_name: showName,
        search: search,
        genre: genre,
        date_from: dateFrom,
        date_to: dateTo,
        page: page,
        page_size: pageSize,
      },
      errors: {
        422: `Validation Error`,
      },
    })
  }
  /**
   * Stream Recording
   * Stream a livestream recording file
   * @param recordingId
   * @returns any Successful Response
   * @throws ApiError
   */
  public streamRecordingRecordingsStreamRecordingIdGet(
    recordingId: number
  ): CancelablePromise<any> {
    return this.httpRequest.request({
      method: 'GET',
      url: '/recordings/stream/{recording_id}',
      path: {
        recording_id: recordingId,
      },
      errors: {
        404: `Recording not found`,
        422: `Validation Error`,
      },
    })
  }
}
