/**
 * Pure model layer for the multi-segment audio editor. No React or DOM dependencies.
 *
 * A segment is one piece of the rendered output timeline. Two kinds exist:
 * - SourceSegment: a slice of the source recording with gain and fades.
 * - SilenceSegment: a stretch of pure silence with optional fades.
 *
 * The serialized form is intentionally a positional tuple (not keyed objects) so the
 * encoded edit blob stays compact enough to live in a URL.
 */

export type SegmentArray = SourceSegmentArray | SilenceSegmentArray

/** [tag=0, sourceStart, sourceEnd, gain, fadeIn, fadeOut, crossfadePrev] */
export type SourceSegmentArray = [
  0,
  number,
  number,
  number,
  number,
  number,
  number,
]

/** [tag=1, duration, fadeIn, fadeOut] */
export type SilenceSegmentArray = [1, number, number, number]

const ROUND_FACTOR = 1000

/** Round to 3 decimals, matching the frozen wire contract. */
export const round3 = (n: number): number =>
  Math.round(n * ROUND_FACTOR) / ROUND_FACTOR

export abstract class EditSegment {
  /** Discriminator tag used as the first element of the serialized tuple. */
  abstract readonly tag: 0 | 1

  /** Audible length of this segment in seconds (before crossfade consumption). */
  abstract duration(): number

  /** Throw with a human-readable message if the segment is internally inconsistent. */
  abstract validate(recDuration: number): void

  /** Serialize to the positional tuple form, all numbers rounded to 3 decimals. */
  abstract toArray(): SegmentArray

  /** Deserialize a segment from its positional tuple, dispatching on the tag. */
  static fromArray(arr: SegmentArray): EditSegment {
    const tag = arr[0]
    if (tag === 0) {
      return SourceSegment.fromArray(arr as SourceSegmentArray)
    }
    if (tag === 1) {
      return SilenceSegment.fromArray(arr as SilenceSegmentArray)
    }
    throw new Error(`Unknown segment tag: ${tag as number}`)
  }
}

export class SourceSegment extends EditSegment {
  readonly tag = 0 as const

  sourceStart: number
  sourceEnd: number
  /** Linear gain multiplier, 0..2 in the UI but only required to be >= 0 here. */
  gain: number
  fadeIn: number
  fadeOut: number
  /** Seconds of equal-power crossfade overlapping the previous segment's tail. */
  crossfadePrev: number

  constructor(params: {
    sourceStart: number
    sourceEnd: number
    gain?: number
    fadeIn?: number
    fadeOut?: number
    crossfadePrev?: number
  }) {
    super()
    this.sourceStart = params.sourceStart
    this.sourceEnd = params.sourceEnd
    this.gain = params.gain ?? 1
    this.fadeIn = params.fadeIn ?? 0
    this.fadeOut = params.fadeOut ?? 0
    this.crossfadePrev = params.crossfadePrev ?? 0
  }

  duration(): number {
    return round3(this.sourceEnd - this.sourceStart)
  }

  validate(recDuration: number): void {
    if (this.sourceStart < 0) {
      throw new Error('Source segment start must be >= 0')
    }
    if (this.sourceEnd <= this.sourceStart) {
      throw new Error('Source segment end must be greater than start')
    }
    if (recDuration > 0 && this.sourceEnd > recDuration + 1e-3) {
      throw new Error('Source segment end exceeds recording duration')
    }
    if (this.gain < 0) {
      throw new Error('Source segment gain must be >= 0')
    }
    if (this.fadeIn < 0 || this.fadeOut < 0) {
      throw new Error('Fades must be >= 0')
    }
    if (this.crossfadePrev < 0) {
      throw new Error('Crossfade must be >= 0')
    }
    const len = this.duration()
    if (this.fadeIn + this.fadeOut > len + 1e-3) {
      throw new Error('Fades cannot exceed segment duration')
    }
  }

  toArray(): SourceSegmentArray {
    return [
      0,
      round3(this.sourceStart),
      round3(this.sourceEnd),
      round3(this.gain),
      round3(this.fadeIn),
      round3(this.fadeOut),
      round3(this.crossfadePrev),
    ]
  }

  static fromArray(arr: SourceSegmentArray): SourceSegment {
    const [, sourceStart, sourceEnd, gain, fadeIn, fadeOut, crossfadePrev] = arr
    return new SourceSegment({
      sourceStart,
      sourceEnd,
      gain,
      fadeIn,
      fadeOut,
      crossfadePrev,
    })
  }
}

export class SilenceSegment extends EditSegment {
  readonly tag = 1 as const

  silenceDuration: number
  fadeIn: number
  fadeOut: number

  constructor(params: { duration: number; fadeIn?: number; fadeOut?: number }) {
    super()
    this.silenceDuration = params.duration
    this.fadeIn = params.fadeIn ?? 0
    this.fadeOut = params.fadeOut ?? 0
  }

  duration(): number {
    return round3(this.silenceDuration)
  }

  validate(_recDuration: number): void {
    if (this.silenceDuration <= 0) {
      throw new Error('Silence duration must be greater than 0')
    }
    if (this.fadeIn < 0 || this.fadeOut < 0) {
      throw new Error('Fades must be >= 0')
    }
    if (this.fadeIn + this.fadeOut > this.silenceDuration + 1e-3) {
      throw new Error('Fades cannot exceed silence duration')
    }
  }

  toArray(): SilenceSegmentArray {
    return [
      1,
      round3(this.silenceDuration),
      round3(this.fadeIn),
      round3(this.fadeOut),
    ]
  }

  static fromArray(arr: SilenceSegmentArray): SilenceSegment {
    const [, duration, fadeIn, fadeOut] = arr
    return new SilenceSegment({ duration, fadeIn, fadeOut })
  }
}
