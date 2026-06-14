import React, { useMemo } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Footer } from '../components/Footer'
import { RecordingEditor } from '../components/RecordingEditor'
import { authUtils } from '../utils/auth'
import { EditSpec, EditUrls } from '../edit'

/**
 * Auth-gated host page for the audio editor. Serves two routes:
 * - /recordings/:recordingId/edit — start a fresh edit of a recording.
 * - /edit/:blob — restore an edit previously encoded into a shareable blob.
 */
export const RecordingEditorPage: React.FC = () => {
  const navigate = useNavigate()
  const { recordingId, blob } = useParams<{
    recordingId?: string
    blob?: string
  }>()

  const { spec, error } = useMemo<{
    spec: EditSpec | null
    error: string | null
  }>(() => {
    if (blob) {
      try {
        return { spec: EditUrls.parseBlob(blob), error: null }
      } catch (err) {
        return {
          spec: null,
          error: err instanceof Error ? err.message : 'Invalid edit link',
        }
      }
    }
    if (recordingId) {
      const id = Number(recordingId)
      if (!Number.isFinite(id)) {
        return { spec: null, error: 'Invalid recording id' }
      }
      // A fresh edit starts empty; the user marks export regions on the waveform.
      return {
        spec: new EditSpec(id, []),
        error: null,
      }
    }
    return { spec: null, error: 'Nothing to edit' }
  }, [blob, recordingId])

  if (!authUtils.getUserToken()) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="min-h-screen bg-h4ks-dark-800 flex flex-col">
      <div className="flex-1 max-w-5xl w-full mx-auto p-6">
        <div className="space-y-6">
          <div className="border-b-2 border-h4ks-green-700 pb-4">
            <h2 className="text-2xl font-bold text-h4ks-green-400 font-mono mb-2">
              [AUDIO EDITOR]
            </h2>
            <p className="text-gray-400 text-sm">
              Click the waveform to position the playhead, then + Add region to
              mark export regions and tune their volume, fades and crossfades
              into a shareable clip.
            </p>
          </div>

          {error || !spec ? (
            <div className="border-2 border-red-800 bg-h4ks-dark-900 p-4 text-red-400 font-mono text-sm">
              {error || 'Unable to open editor'}
            </div>
          ) : (
            <RecordingEditor key={blob ?? recordingId} initialSpec={spec} />
          )}
        </div>
      </div>

      <Footer
        actionButton={{
          label: '[← BACK TO HOME]',
          onClick: () => navigate('/'),
        }}
      />
    </div>
  )
}
