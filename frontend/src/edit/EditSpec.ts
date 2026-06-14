import { EditSegment, SegmentArray, SourceSegment, round3 } from './EditSegment'

/** Current on-the-wire format version. Bump only with a migration path. */
export const EDIT_FORMAT_VERSION = 1

/** [version, recordingId, segments] */
export type EditSpecArray = [number, number, SegmentArray[]]

/**
 * An ordered list of segments that render to a single audio clip from one source recording.
 *
 * Mutating helpers (add/remove/reorder/replace) return `this` so callers in React land can
 * clone-then-mutate without juggling intermediate references.
 */
export class EditSpec {
  recordingId: number
  segments: EditSegment[]

  constructor(recordingId: number, segments: EditSegment[] = []) {
    this.recordingId = recordingId
    this.segments = segments
  }

  addSegment(segment: EditSegment, index?: number): this {
    if (index === undefined || index >= this.segments.length) {
      this.segments.push(segment)
    } else {
      this.segments.splice(Math.max(0, index), 0, segment)
    }
    return this
  }

  removeSegment(index: number): this {
    if (index >= 0 && index < this.segments.length) {
      this.segments.splice(index, 1)
    }
    return this
  }

  replaceSegment(index: number, segment: EditSegment): this {
    if (index >= 0 && index < this.segments.length) {
      this.segments[index] = segment
    }
    return this
  }

  reorder(from: number, to: number): this {
    const n = this.segments.length
    if (from < 0 || from >= n || to < 0 || to >= n || from === to) {
      return this
    }
    const [moved] = this.segments.splice(from, 1)
    this.segments.splice(to, 0, moved)
    return this
  }

  /**
   * Total rendered duration accounting for crossfade consumption.
   * Each source segment's crossfadePrev overlaps the previous segment's tail, so the
   * timeline is shortened by the sum of all crossfades: Σdur − Σcrossfades.
   */
  totalDuration(): number {
    let sumDur = 0
    let sumCrossfade = 0
    this.segments.forEach((seg, i) => {
      sumDur += seg.duration()
      if (i > 0 && seg instanceof SourceSegment && seg.crossfadePrev > 0) {
        sumCrossfade += Math.min(
          seg.crossfadePrev,
          this.segments[i - 1].duration(),
          seg.duration()
        )
      }
    })
    return round3(Math.max(0, sumDur - sumCrossfade))
  }

  /**
   * Export-timeline start offset (seconds) of each segment, accounting for crossfade overlap: a
   * source segment's crossfadePrev pulls its start back over the previous segment's tail. The join
   * between export segments i−1 and i sits at `segmentStartOffsets()[i]` — where that transition's
   * crossfade begins — so this also locates a transition for auditioning.
   */
  segmentStartOffsets(): number[] {
    const offsets: number[] = []
    let cursor = 0
    this.segments.forEach((seg, i) => {
      const crossfade =
        i > 0 && seg instanceof SourceSegment
          ? Math.min(
              seg.crossfadePrev,
              this.segments[i - 1].duration(),
              seg.duration()
            )
          : 0
      const start = i === 0 ? 0 : cursor - crossfade
      offsets.push(round3(start))
      cursor = start + seg.duration()
    })
    return offsets
  }

  validate(recDuration: number): void {
    if (!Number.isFinite(this.recordingId)) {
      throw new Error('EditSpec requires a numeric recordingId')
    }
    if (this.segments.length === 0) {
      throw new Error('EditSpec requires at least one segment')
    }
    this.segments.forEach((seg, i) => {
      seg.validate(recDuration)
      if (i === 0 && seg instanceof SourceSegment && seg.crossfadePrev > 0) {
        throw new Error(
          'First segment cannot have a crossfade with a previous segment'
        )
      }
      if (seg instanceof SourceSegment && seg.crossfadePrev > 0) {
        const prev = this.segments[i - 1]
        const maxCrossfade = Math.min(seg.duration(), prev.duration())
        if (seg.crossfadePrev > maxCrossfade + 1e-3) {
          throw new Error(
            'Crossfade cannot exceed the shorter of the two adjacent segments'
          )
        }
      }
    })
  }

  toArray(): EditSpecArray {
    return [
      EDIT_FORMAT_VERSION,
      this.recordingId,
      this.segments.map((s) => s.toArray()),
    ]
  }

  static fromArray(arr: EditSpecArray): EditSpec {
    const [version, recordingId, segments] = arr
    if (version !== EDIT_FORMAT_VERSION) {
      throw new Error(`Unsupported edit format version: ${version}`)
    }
    return new EditSpec(
      recordingId,
      segments.map((s) => EditSegment.fromArray(s))
    )
  }

  /** Deep clone, used by React callers to keep state updates immutable. */
  clone(): EditSpec {
    return EditSpec.fromArray(this.toArray())
  }
}
