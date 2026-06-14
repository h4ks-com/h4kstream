import { EditSpec } from './EditSpec'
import { SilenceSegment, SourceSegment } from './EditSegment'

const makeSpec = () =>
  new EditSpec(42, [
    new SourceSegment({ sourceStart: 0, sourceEnd: 10 }),
    new SilenceSegment({ duration: 2 }),
    new SourceSegment({ sourceStart: 20, sourceEnd: 25 }),
  ])

describe('EditSpec mutation helpers', () => {
  it('addSegment appends and inserts at an index', () => {
    const spec = new EditSpec(1, [])
    spec.addSegment(new SourceSegment({ sourceStart: 0, sourceEnd: 1 }))
    spec.addSegment(new SilenceSegment({ duration: 1 }))
    spec.addSegment(new SourceSegment({ sourceStart: 2, sourceEnd: 3 }), 1)
    expect(spec.segments).toHaveLength(3)
    expect(spec.segments[1]).toBeInstanceOf(SourceSegment)
    expect((spec.segments[1] as SourceSegment).sourceStart).toBe(2)
  })

  it('removeSegment drops the segment at an index', () => {
    const spec = makeSpec()
    spec.removeSegment(1)
    expect(spec.segments).toHaveLength(2)
    expect(spec.segments.every((s) => s instanceof SourceSegment)).toBe(true)
  })

  it('replaceSegment swaps in a new segment', () => {
    const spec = makeSpec()
    spec.replaceSegment(0, new SilenceSegment({ duration: 5 }))
    expect(spec.segments[0]).toBeInstanceOf(SilenceSegment)
  })

  it('reorder moves a segment from one position to another', () => {
    const spec = makeSpec()
    spec.reorder(0, 2)
    expect(spec.segments[2]).toBeInstanceOf(SourceSegment)
    expect((spec.segments[2] as SourceSegment).sourceEnd).toBe(10)
    expect(spec.segments[0]).toBeInstanceOf(SilenceSegment)
  })

  it('reorder is a no-op for out-of-range or equal indices', () => {
    const spec = makeSpec()
    const before = spec.toArray()
    spec.reorder(0, 0)
    spec.reorder(-1, 2)
    spec.reorder(0, 99)
    expect(spec.toArray()).toEqual(before)
  })
})

describe('EditSpec.totalDuration', () => {
  it('sums segment durations with no crossfades', () => {
    const spec = makeSpec()
    expect(spec.totalDuration()).toBe(17)
  })

  it('subtracts crossfade consumption from the total', () => {
    const spec = new EditSpec(1, [
      new SourceSegment({ sourceStart: 0, sourceEnd: 10 }),
      new SourceSegment({ sourceStart: 10, sourceEnd: 18, crossfadePrev: 3 }),
    ])
    expect(spec.totalDuration()).toBe(15)
  })

  it('ignores a crossfade on the first segment', () => {
    const spec = new EditSpec(1, [
      new SourceSegment({ sourceStart: 0, sourceEnd: 5, crossfadePrev: 2 }),
      new SourceSegment({ sourceStart: 5, sourceEnd: 10 }),
    ])
    expect(spec.totalDuration()).toBe(10)
  })
})

describe('EditSpec.segmentStartOffsets', () => {
  it('places back-to-back segments at cumulative offsets with no crossfade', () => {
    const spec = new EditSpec(1, [
      new SourceSegment({ sourceStart: 0, sourceEnd: 5 }),
      new SourceSegment({ sourceStart: 10, sourceEnd: 14 }),
      new SourceSegment({ sourceStart: 20, sourceEnd: 26 }),
    ])
    expect(spec.segmentStartOffsets()).toEqual([0, 5, 9])
  })

  it('pulls a segment back by its crossfade so the offset marks where the join begins', () => {
    const spec = new EditSpec(1, [
      new SourceSegment({ sourceStart: 0, sourceEnd: 10 }),
      new SourceSegment({ sourceStart: 10, sourceEnd: 18, crossfadePrev: 3 }),
    ])
    // Second segment starts at 10 − 3 = 7; total (7 + 8 = 15) agrees with totalDuration.
    expect(spec.segmentStartOffsets()).toEqual([0, 7])
    expect(spec.totalDuration()).toBe(15)
  })

  it('advances the running offset across silence segments', () => {
    const spec = new EditSpec(1, [
      new SourceSegment({ sourceStart: 0, sourceEnd: 4 }),
      new SilenceSegment({ duration: 2 }),
      new SourceSegment({ sourceStart: 10, sourceEnd: 13 }),
    ])
    expect(spec.segmentStartOffsets()).toEqual([0, 4, 6])
  })
})

describe('EditSpec.validate', () => {
  it('rejects an empty spec', () => {
    expect(() => new EditSpec(1, []).validate(100)).toThrow()
  })

  it('rejects a crossfade on the first segment', () => {
    const spec = new EditSpec(1, [
      new SourceSegment({ sourceStart: 0, sourceEnd: 5, crossfadePrev: 1 }),
    ])
    expect(() => spec.validate(100)).toThrow()
  })

  it('rejects a crossfade longer than the adjacent segments', () => {
    const spec = new EditSpec(1, [
      new SourceSegment({ sourceStart: 0, sourceEnd: 2 }),
      new SourceSegment({ sourceStart: 2, sourceEnd: 10, crossfadePrev: 5 }),
    ])
    expect(() => spec.validate(100)).toThrow()
  })

  it('accepts a valid multi-segment spec', () => {
    expect(() => makeSpec().validate(100)).not.toThrow()
  })
})

describe('EditSpec round-trip', () => {
  it('preserves segments and ordering through toArray/fromArray', () => {
    const spec = new EditSpec(7, [
      new SourceSegment({
        sourceStart: 1,
        sourceEnd: 4,
        gain: 1.5,
        fadeIn: 0.2,
        fadeOut: 0.3,
      }),
      new SilenceSegment({ duration: 1.5, fadeIn: 0.1 }),
      new SourceSegment({ sourceStart: 8, sourceEnd: 12, crossfadePrev: 0.5 }),
    ])
    const restored = EditSpec.fromArray(spec.toArray())
    expect(restored.recordingId).toBe(7)
    expect(restored.segments).toHaveLength(3)
    expect(restored.segments[0]).toBeInstanceOf(SourceSegment)
    expect(restored.segments[1]).toBeInstanceOf(SilenceSegment)
    expect(restored.segments[2]).toBeInstanceOf(SourceSegment)
    expect(restored.toArray()).toEqual(spec.toArray())
  })

  it('clone produces an independent deep copy', () => {
    const spec = makeSpec()
    const copy = spec.clone()
    copy.removeSegment(0)
    expect(spec.segments).toHaveLength(3)
    expect(copy.segments).toHaveLength(2)
  })

  it('rejects an unsupported format version', () => {
    expect(() => EditSpec.fromArray([99, 1, [[1, 1, 0, 0]]])).toThrow()
  })
})
