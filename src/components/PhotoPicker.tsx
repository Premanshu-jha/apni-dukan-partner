import { useEffect, useId, useState } from 'react'
import { messageOf } from '../api/errors'
import { usePhotoLink } from '../api/shop'
import { shrinkPhoto } from '../lib/image'
import { Banner, Spinner } from './ui'

/**
 * One photo: shows the current one (from its file id) or the one just picked, and uploads a new pick with
 * upload(), which returns once the backend has it.
 */
export function PhotoPicker({
  label,
  hint,
  fileId,
  capture,
  upload,
  disabled,
}: {
  label: string
  hint?: string
  fileId: string | null
  capture?: 'user' | 'environment'
  upload: (photo: Blob) => Promise<void>
  disabled?: boolean
}) {
  const id = useId()
  const link = usePhotoLink(fileId)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

  async function picked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Pick a photo.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const small = await shrinkPhoto(file)
      await upload(small)
      setPreview(URL.createObjectURL(small))
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  const src = preview ?? link.data?.url ?? null
  const has = Boolean(fileId)
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-muted">{label}</p>
      <label
        htmlFor={id}
        className={`relative flex aspect-[4/3] w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed ${has ? 'border-line' : 'border-brand/60'} bg-surface ${disabled || busy ? 'pointer-events-none opacity-60' : ''}`}
      >
        {src ? (
          <img src={src} alt={label} className="h-full w-full object-cover" />
        ) : has ? (
          <span className="text-sm text-muted">Photo saved</span>
        ) : (
          <span className="flex flex-col items-center gap-1 text-sm text-brand">
            <span aria-hidden className="text-3xl">＋</span>
            Take or choose a photo
          </span>
        )}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Spinner label="Uploading…" />
          </span>
        )}
      </label>
      <input
        id={id}
        type="file"
        accept="image/*"
        capture={capture}
        className="sr-only"
        aria-label={has ? `Change ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}
        onChange={picked}
        disabled={disabled || busy}
      />
      {hint && !error && <p className="text-sm text-muted">{hint}</p>}
      {error && <Banner tone="bad">{error}</Banner>}
    </div>
  )
}
