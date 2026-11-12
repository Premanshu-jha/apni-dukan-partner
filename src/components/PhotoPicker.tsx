import { useEffect, useId, useRef, useState } from 'react'
import { messageOf } from '../api/errors'
import { usePhotoLink } from '../api/shop'
import { shrinkPhoto } from '../lib/image'
import { Banner, Button, Spinner } from './ui'

/** What the backend takes for photos (FileService): anything else the phone can't turn into a JPEG is refused. */
const USABLE = ['image/jpeg', 'image/png']
export const PHOTO_FORMAT_TEXT =
  "This photo's format can't be used (often an iPhone or Samsung HEIC photo). Take it with Take photo, or pick a JPG."

/**
 * One photo: shows the current one (from its file id) or the one just picked, and uploads a new pick with
 * upload(), which returns once the backend has it. Two buttons under it: Take photo (the camera) and Choose from
 * gallery; once a photo is there they say Retake photo and Choose another, so a wrong photo is replaced on the spot.
 * Tapping the photo itself opens the camera too.
 */
export function PhotoPicker({
  label,
  hint,
  fileId,
  capture,
  upload,
  disabled,
  onBusy,
}: {
  label: string
  hint?: string
  fileId: string | null
  capture?: 'user' | 'environment'
  upload: (photo: Blob) => Promise<void>
  disabled?: boolean
  /** Told when an upload starts and ends (the page asks before leaving meanwhile). */
  onBusy?: (busy: boolean) => void
}) {
  const id = useId()
  const gallery = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  const link = usePhotoLink(fileId)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** The photo whose upload failed, so Try again doesn't need it taken again. */
  const [failed, setFailed] = useState<Blob | null>(null)

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

  useEffect(() => {
    if (!busy) return
    onBusy?.(true)
    return () => onBusy?.(false)
  }, [busy, onBusy])

  /** Uploads a photo already shrunk; the caller set busy. */
  async function send(small: Blob) {
    try {
      await upload(small)
      setPreview(URL.createObjectURL(small))
      setFailed(null)
    } catch (err) {
      setError(messageOf(err))
      setFailed(small)
    }
  }

  async function retry(small: Blob) {
    setBusy(true)
    setError(null)
    try {
      await send(small)
    } finally {
      setBusy(false)
    }
  }

  async function picked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.type && !file.type.startsWith('image/')) {
      setError('Pick a photo.')
      setFailed(null)
      return
    }
    // Busy from the start: shrinking a 12 MP photo takes a moment on a cheap phone, and a second pick meanwhile
    // could finish first and then be replaced by this one
    setBusy(true)
    setError(null)
    try {
      const small = await shrinkPhoto(file)
      // The phone couldn't redraw it as a JPEG (shrinkPhoto gave the file back) and it isn't one the backend takes
      if (small === file && !USABLE.includes(file.type)) {
        setError(PHOTO_FORMAT_TEXT)
        setFailed(null)
        return
      }
      await send(small)
    } finally {
      setBusy(false)
    }
  }

  const src = preview ?? link.data?.url ?? null
  const has = Boolean(fileId)
  const name = label.toLowerCase()
  const off = disabled || busy
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-muted">{label}</p>
      <label
        htmlFor={id}
        className={`relative flex aspect-[4/3] w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed ${has ? 'border-line' : 'border-brand/60'} bg-surface ${off ? 'pointer-events-none opacity-60' : ''}`}
      >
        {src ? (
          <img src={src} alt={label} className="h-full w-full object-cover" />
        ) : has ? (
          <span className="text-sm text-muted">Photo saved</span>
        ) : (
          <span className="flex flex-col items-center gap-1 text-sm text-link">
            <span aria-hidden className="text-3xl">＋</span>
            Take or choose a photo
          </span>
        )}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-scrim/50">
            <Spinner label="Uploading…" />
          </span>
        )}
      </label>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={has ? 'secondary' : 'primary'}
          disabled={off}
          aria-label={`${has ? 'Retake' : 'Take'} ${name}`}
          onClick={() => camera.current?.click()}
        >
          {has ? 'Retake photo' : 'Take photo'}
        </Button>
        <Button
          variant="secondary"
          disabled={off}
          aria-label={`${has ? 'Choose another' : 'Choose'} ${name} from gallery`}
          onClick={() => gallery.current?.click()}
        >
          {has ? 'Choose another' : 'Choose from gallery'}
        </Button>
      </div>
      {/* The camera (the tile and Take photo); the label is what tests and screen readers use */}
      <input
        id={id}
        ref={camera}
        type="file"
        accept="image/*"
        capture={capture}
        className="sr-only"
        tabIndex={-1}
        aria-label={has ? `Change ${name}` : `Add ${name}`}
        onChange={picked}
        disabled={off}
      />
      <input
        ref={gallery}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-label={`Pick ${name} from gallery`}
        onChange={picked}
        disabled={off}
      />
      {hint && !error && <p className="text-sm text-muted">{hint}</p>}
      {error && <Banner tone="bad">{error}</Banner>}
      {error && failed && (
        <Button variant="secondary" disabled={off} aria-label={`Try sending ${name} again`} onClick={() => void retry(failed)}>
          Try again
        </Button>
      )}
    </div>
  )
}
