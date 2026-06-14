/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Downsampled waveform peaks for a recording (one max-amplitude value per bin, 0..1).
 */
export type RecordingPeaks = {
    /**
     * Peaks payload format version
     */
    version: number;
    /**
     * Recording duration in seconds
     */
    duration: number;
    /**
     * Normalised max-amplitude value per bin
     */
    peaks: Array<number>;
};

