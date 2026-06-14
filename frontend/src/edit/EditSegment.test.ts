import {
  EditSegment,
  SilenceSegment,
  SourceSegment,
  round3,
} from './EditSegment'

describe('round3', () => {
  it('rounds to three decimals', () => {
    expect(round3(1.23456)).toBe(1.235)
    expect(round3(0.0004)).toBe(0)
    expect(round3(10)).toBe(10)
  })
})

describe('SourceSegment', () => {
  it('computes duration from source bounds', () => {
    const seg = new SourceSegment({ sourceStart: 2, sourceEnd: 5.5 })
    expect(seg.duration()).toBe(3.5)
  })

  it('applies defaults for optional params', () => {
    const seg = new SourceSegment({ sourceStart: 0, sourceEnd: 1 })
    expect(seg.gain).toBe(1)
    expect(seg.fadeIn).toBe(0)
    expect(seg.fadeOut).toBe(0)
    expect(seg.crossfadePrev).toBe(0)
  })

  it('serializes to a positional tuple rounded to three decimals', () => {
    const seg = new SourceSegment({
      sourceStart: 1.23456,
      sourceEnd: 9.87654,
      gain: 1.5,
      fadeIn: 0.25,
      fadeOut: 0.5,
      crossfadePrev: 0.75,
    })
    expect(seg.toArray()).toEqual([0, 1.235, 9.877, 1.5, 0.25, 0.5, 0.75])
  })

  it('round-trips through fromArray', () => {
    const seg = new SourceSegment({
      sourceStart: 1,
      sourceEnd: 4,
      gain: 2,
      fadeIn: 0.1,
    })
    const restored = SourceSegment.fromArray(seg.toArray())
    expect(restored).toBeInstanceOf(SourceSegment)
    expect(restored.toArray()).toEqual(seg.toArray())
  })

  it('validates bounds, gain and fades', () => {
    expect(() =>
      new SourceSegment({ sourceStart: -1, sourceEnd: 2 }).validate(100)
    ).toThrow()
    expect(() =>
      new SourceSegment({ sourceStart: 5, sourceEnd: 5 }).validate(100)
    ).toThrow()
    expect(() =>
      new SourceSegment({ sourceStart: 0, sourceEnd: 2, gain: -1 }).validate(
        100
      )
    ).toThrow()
    expect(() =>
      new SourceSegment({ sourceStart: 0, sourceEnd: 200 }).validate(100)
    ).toThrow()
    expect(() =>
      new SourceSegment({
        sourceStart: 0,
        sourceEnd: 2,
        fadeIn: 1.5,
        fadeOut: 1.5,
      }).validate(100)
    ).toThrow()
    expect(() =>
      new SourceSegment({ sourceStart: 0, sourceEnd: 2 }).validate(100)
    ).not.toThrow()
  })
})

describe('SilenceSegment', () => {
  it('reports its duration', () => {
    const seg = new SilenceSegment({ duration: 3.2 })
    expect(seg.duration()).toBe(3.2)
  })

  it('serializes and round-trips', () => {
    const seg = new SilenceSegment({ duration: 2.5, fadeIn: 0.1, fadeOut: 0.2 })
    expect(seg.toArray()).toEqual([1, 2.5, 0.1, 0.2])
    const restored = SilenceSegment.fromArray(seg.toArray())
    expect(restored).toBeInstanceOf(SilenceSegment)
    expect(restored.toArray()).toEqual(seg.toArray())
  })

  it('validates duration and fades', () => {
    expect(() => new SilenceSegment({ duration: 0 }).validate(0)).toThrow()
    expect(() =>
      new SilenceSegment({ duration: 1, fadeIn: 2 }).validate(0)
    ).toThrow()
    expect(() => new SilenceSegment({ duration: 5 }).validate(0)).not.toThrow()
  })
})

describe('EditSegment.fromArray polymorphism', () => {
  it('dispatches on the tag to the correct subclass', () => {
    const source = EditSegment.fromArray([0, 0, 5, 1, 0, 0, 0])
    const silence = EditSegment.fromArray([1, 3, 0, 0])
    expect(source).toBeInstanceOf(SourceSegment)
    expect(silence).toBeInstanceOf(SilenceSegment)
  })

  it('throws on an unknown tag', () => {
    expect(() =>
      EditSegment.fromArray([9 as never, 0, 0, 0] as never)
    ).toThrow()
  })
})
