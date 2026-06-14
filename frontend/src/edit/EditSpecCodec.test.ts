import { EditSpecCodec } from './EditSpecCodec'
import { EditSpec } from './EditSpec'
import { SilenceSegment, SourceSegment } from './EditSegment'

describe('EditSpecCodec', () => {
  it('produces a URL-safe blob with no padding or unsafe characters', () => {
    const spec = new EditSpec(123456, [
      new SourceSegment({
        sourceStart: 0,
        sourceEnd: 30,
        gain: 1.25,
        fadeIn: 1,
        fadeOut: 2,
        crossfadePrev: 0,
      }),
      new SilenceSegment({ duration: 4, fadeIn: 0.5, fadeOut: 0.5 }),
      new SourceSegment({
        sourceStart: 60.123,
        sourceEnd: 90.456,
        crossfadePrev: 1.5,
      }),
    ])
    const blob = EditSpecCodec.encode(spec)
    expect(blob).not.toMatch(/[+/=]/)
    expect(blob).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('round-trips an EditSpec exactly', () => {
    const spec = new EditSpec(99, [
      new SourceSegment({
        sourceStart: 1.111,
        sourceEnd: 22.222,
        gain: 0.5,
        fadeIn: 0.3,
        fadeOut: 0.4,
      }),
      new SilenceSegment({ duration: 3.333 }),
      new SourceSegment({ sourceStart: 40, sourceEnd: 50, crossfadePrev: 2 }),
    ])
    const restored = EditSpecCodec.decode(EditSpecCodec.encode(spec))
    expect(restored.toArray()).toEqual(spec.toArray())
    expect(restored.segments[0]).toBeInstanceOf(SourceSegment)
    expect(restored.segments[1]).toBeInstanceOf(SilenceSegment)
  })

  it('round-trips across a range of payload lengths to exercise base64 padding', () => {
    for (let count = 1; count <= 6; count += 1) {
      const segments = Array.from(
        { length: count },
        (_, i) => new SourceSegment({ sourceStart: i, sourceEnd: i + 1 })
      )
      const spec = new EditSpec(count, segments)
      const restored = EditSpecCodec.decode(EditSpecCodec.encode(spec))
      expect(restored.toArray()).toEqual(spec.toArray())
    }
  })

  it('rejects a blob whose length is impossible for base64url', () => {
    expect(() => EditSpecCodec.decode('A')).toThrow()
  })
})
