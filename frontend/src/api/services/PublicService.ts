/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AddSongRequest } from "../models/AddSongRequest";
import type { CancelablePromise } from "../core/CancelablePromise";
import type { BaseHttpRequest } from "../core/BaseHttpRequest";
export class PublicService {
  constructor(public readonly httpRequest: BaseHttpRequest) {}
  /**
   * Add Song
   * @param requestBody
   * @returns any Successful Response
   * @throws ApiError
   */
  public addSongApiPublicAddPost(
    requestBody: AddSongRequest,
  ): CancelablePromise<any> {
    return this.httpRequest.request({
      method: "POST",
      url: "/api/public/add",
      body: requestBody,
      mediaType: "application/json",
      errors: {
        422: `Validation Error`,
      },
    });
  }
  /**
   * List Songs
   * @returns any Successful Response
   * @throws ApiError
   */
  public listSongsApiPublicListGet(): CancelablePromise<any> {
    return this.httpRequest.request({
      method: "GET",
      url: "/api/public/list",
    });
  }
  /**
   * Delete Song
   * @param songId
   * @returns any Successful Response
   * @throws ApiError
   */
  public deleteSongApiPublicDeletePost(songId: string): CancelablePromise<any> {
    return this.httpRequest.request({
      method: "POST",
      url: "/api/public/delete",
      query: {
        song_id: songId,
      },
      errors: {
        422: `Validation Error`,
      },
    });
  }
}
