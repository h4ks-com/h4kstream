/**
 * Network + decode helpers for the editor.
 *
 * Peaks require a logged-in user, so they go through the refresh-wrapped generated client
 * (`RecordingsService`) which auto-retries on a 401 after refreshing the token. The clip render
 * and the byte-range stream are public, so the range stream stays a raw fetch.
 */
/* eslint-disable no-restricted-globals */

import { RecordingsService } from '../utils/apiClient'

export type PeaksResponse = {
  version: number
  duration: number
  peaks: number[]
}

const origin = (): string => window.location.origin

/** Fetch precomputed waveform peaks for a recording (one max-amplitude value per bin). */
export const fetchPeaks = async (
  recordingId: number,
  bins = 1500
): Promise<PeaksResponse> => {
  const data =
    await RecordingsService().recordingPeaksRecordingsRecordingIdPeaksGet(
      recordingId,
      bins
    )
  return { version: data.version, duration: data.duration, peaks: data.peaks }
}

/** Fetch a byte range of the recording as raw MP3 bytes for client-side decoding. */
export const fetchRange = async (
  recordingId: number,
  start: number,
  end: number
): Promise<ArrayBuffer> => {
  const url = `${origin()}/api/recordings/stream/${recordingId}?start=${start}&end=${end}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to load audio range (${res.status})`)
  }
  return res.arrayBuffer()
}
