import { EditSpec } from './EditSpec'
import { EditSpecCodec } from './EditSpecCodec'

/**
 * Builds the client-side and server-side URLs for an edit. The audio URL is constructed
 * locally (no network round-trip to "create" a clip); the server renders the clip on the
 * fly from the encoded blob, which is why the link plays/downloads anywhere but can't be
 * seeked.
 */
export class EditUrls {
  private static origin(): string {
    return window.location.origin
  }

  /** In-app editor route that restores this exact edit from its blob. */
  static editorUrl(spec: EditSpec): string {
    return `${EditUrls.origin()}/edit/${EditSpecCodec.encode(spec)}`
  }

  /** Public render endpoint. Append `?dl=1` to force a download. */
  static audioUrl(spec: EditSpec, dl = false): string {
    const blob = EditSpecCodec.encode(spec)
    const base = `${EditUrls.origin()}/api/recordings/clip/${blob}.mp3`
    return dl ? `${base}?dl=1` : base
  }

  /** Restore an EditSpec from a blob taken out of a `/edit/:blob` route. */
  static parseBlob(blob: string): EditSpec {
    return EditSpecCodec.decode(blob)
  }
}
