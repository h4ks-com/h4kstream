import { EditUrls } from './EditUrls'
import { EditSpec } from './EditSpec'
import { SourceSegment } from './EditSegment'

const makeSpec = () =>
  new EditSpec(55, [
    new SourceSegment({ sourceStart: 0, sourceEnd: 12.5, gain: 1.5 }),
  ])

describe('EditUrls', () => {
  it('builds an editor URL whose blob restores the original spec', () => {
    const spec = makeSpec()
    const url = EditUrls.editorUrl(spec)
    expect(url).toContain(`${window.location.origin}/edit/`)
    const blob = url.split('/edit/')[1]
    expect(EditUrls.parseBlob(blob).toArray()).toEqual(spec.toArray())
  })

  it('builds a public audio URL ending in .mp3', () => {
    const url = EditUrls.audioUrl(makeSpec())
    expect(url).toContain(`${window.location.origin}/api/recordings/clip/`)
    expect(url.endsWith('.mp3')).toBe(true)
  })

  it('appends ?dl=1 for the download variant', () => {
    const url = EditUrls.audioUrl(makeSpec(), true)
    expect(url.endsWith('.mp3?dl=1')).toBe(true)
  })

  it('parseBlob reverses the editor URL blob', () => {
    const spec = makeSpec()
    const blob = EditUrls.editorUrl(spec).split('/edit/')[1]
    const restored = EditUrls.parseBlob(blob)
    expect(restored.recordingId).toBe(55)
  })
})
