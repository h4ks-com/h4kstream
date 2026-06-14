import { EditSpec, EditSpecArray } from './EditSpec'

/**
 * Serializes an EditSpec to/from a URL-safe blob.
 *
 * The blob is base64url (RFC 4648 §5, no `=` padding) of the UTF-8 JSON of the spec's
 * positional-tuple array form. base64url keeps the blob safe to drop straight into a path
 * segment without percent-encoding.
 */

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromBase64Url = (blob: string): Uint8Array => {
  let base64 = blob.replace(/-/g, '+').replace(/_/g, '/')
  const padding = base64.length % 4
  if (padding === 2) {
    base64 += '=='
  } else if (padding === 3) {
    base64 += '='
  } else if (padding === 1) {
    throw new Error('Invalid base64url blob length')
  }
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export class EditSpecCodec {
  static encode(spec: EditSpec): string {
    const json = JSON.stringify(spec.toArray())
    const bytes = new TextEncoder().encode(json)
    return toBase64Url(bytes)
  }

  static decode(blob: string): EditSpec {
    const bytes = fromBase64Url(blob)
    const json = new TextDecoder().decode(bytes)
    const arr = JSON.parse(json) as EditSpecArray
    return EditSpec.fromArray(arr)
  }
}
