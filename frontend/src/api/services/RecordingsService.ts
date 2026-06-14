/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { RecordingPeaks } from '../models/RecordingPeaks';
import type { RecordingsListResponse } from '../models/RecordingsListResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
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
        showName?: (string | null),
        search?: (string | null),
        genre?: (string | null),
        dateFrom?: (string | null),
        dateTo?: (string | null),
        page: number = 1,
        pageSize: number = 20,
    ): CancelablePromise<RecordingsListResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/recordings/list',
            query: {
                'show_name': showName,
                'search': search,
                'genre': genre,
                'date_from': dateFrom,
                'date_to': dateTo,
                'page': page,
                'page_size': pageSize,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Render Recording Edit Clip
     * Render an edit of a recording, described entirely by the URL blob, to MP3 on the fly. The blob encodes the recording id and an ordered list of cut/silence segments with per-segment gain, fades and equal-power crossfades. Public and unauthenticated; nothing is written to disk. Add ?dl=1 to download instead of inline playback.
     * @param blob
     * @param dl Download instead of inline playback
     * @returns any Rendered MP3 clip
     * @throws ApiError
     */
    public renderClipRecordingsClipBlobMp3Get(
        blob: string,
        dl: boolean = false,
    ): CancelablePromise<any> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/recordings/clip/{blob}.mp3',
            path: {
                'blob': blob,
            },
            query: {
                'dl': dl,
            },
            errors: {
                400: `Invalid edit`,
                404: `Recording not found`,
                422: `Validation Error`,
                503: `Renderer busy`,
            },
        });
    }
    /**
     * Recording Waveform Peaks
     * Downsampled waveform peaks for the editor. Requires a logged-in user.
     * @param recordingId
     * @param bins Number of waveform bins
     * @returns RecordingPeaks Successful Response
     * @throws ApiError
     */
    public recordingPeaksRecordingsRecordingIdPeaksGet(
        recordingId: number,
        bins: number = 1500,
    ): CancelablePromise<RecordingPeaks> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/recordings/{recording_id}/peaks',
            path: {
                'recording_id': recordingId,
            },
            query: {
                'bins': bins,
            },
            errors: {
                401: `Unauthorized`,
                404: `Recording not found`,
                422: `Validation Error`,
            },
        });
    }
    /**
     * Stream Recording
     * Stream a livestream recording file. Use start/end (seconds) to request a time-range segment.
     * @param recordingId
     * @param start Start offset in seconds
     * @param end End offset in seconds
     * @returns any Successful Response
     * @throws ApiError
     */
    public streamRecordingRecordingsStreamRecordingIdGet(
        recordingId: number,
        start?: (number | null),
        end?: (number | null),
    ): CancelablePromise<any> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/recordings/stream/{recording_id}',
            path: {
                'recording_id': recordingId,
            },
            query: {
                'start': start,
                'end': end,
            },
            errors: {
                404: `Recording not found`,
                422: `Validation Error`,
            },
        });
    }
}
