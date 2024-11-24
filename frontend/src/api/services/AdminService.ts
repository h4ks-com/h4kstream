/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AddSongRequest } from "../models/AddSongRequest";
import type { DeleteSongRequest } from "../models/DeleteSongRequest";
import type { CancelablePromise } from "../core/CancelablePromise";
import type { BaseHttpRequest } from "../core/BaseHttpRequest";
export class AdminService {
  constructor(public readonly httpRequest: BaseHttpRequest) {}
  /**
   * Add To Mainloop
   * @param requestBody
   * @returns any Successful Response
   * @throws ApiError
   */
  public addToMainloopApiAdminMainloopAddPost(
    requestBody: AddSongRequest,
  ): CancelablePromise<any> {
    return this.httpRequest.request({
      method: "POST",
      url: "/api/admin/mainloop-add",
      body: requestBody,
      mediaType: "application/json",
      errors: {
        422: `Validation Error`,
      },
    });
  }
  /**
   * List All Songs
   * @returns any Successful Response
   * @throws ApiError
   */
  public listAllSongsApiAdminListGet(): CancelablePromise<any> {
    return this.httpRequest.request({
      method: "GET",
      url: "/api/admin/list",
    });
  }
  /**
   * Admin Delete Song
   * @param requestBody
   * @returns any Successful Response
   * @throws ApiError
   */
  public adminDeleteSongApiAdminDeletePost(
    requestBody: DeleteSongRequest,
  ): CancelablePromise<any> {
    return this.httpRequest.request({
      method: "POST",
      url: "/api/admin/delete",
      body: requestBody,
      mediaType: "application/json",
      errors: {
        422: `Validation Error`,
      },
    });
  }
}
