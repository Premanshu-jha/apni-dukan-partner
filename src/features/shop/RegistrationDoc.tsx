import { useEffect, useId, useState } from 'react'
import { explain } from '../../api/errors'
import { fileApi, usePhotoLink } from '../../api/shop'
import type { RegistrationDocType } from '../../api/types'
import { Banner, Card, Spinner } from '../../components/ui'
import { shrinkPhoto } from '../../lib/image'

export const DOC_TYPES: Array<{ type: RegistrationDocType; label: string; hint: string }> = [
  { type: 'SHOPS_ESTABLISHMENT', label: 'Shops and Establishments certificate', hint: 'From the Labour department' },
  { type: 'TRADE_LICENCE', label: 'Trade licence', hint: 'From GHMC or your municipality' },
  { type: 'UDYAM', label: 'Udyam certificate', hint: 'Your MSME registration' },
]

/** The backend takes files up to 10 MB. */
export const MAX_DOC_BYTES = 10 * 1024 * 1024

export function docLabel(type: RegistrationDocType | null | undefined): string | null {
  return DOC_TYPES.find((d) => d.type === type)?.label ?? null
}

/**
 * A photo or a PDF, or neither. Some file pickers (Drive, some file managers) give no type: then the name's ending
 * decides (the backend checks the bytes anyway).
 */
export function docKind(file: { type: string; name?: string }): 'photo' | 'pdf' | null {
  if (file.type.startsWith('image/')) return 'photo'
  if (file.type === 'application/pdf') return 'pdf'
  if (file.type === '' || file.type === 'application/octet-stream') {
    const name = (file.name ?? '').toLowerCase()
    if (name.endsWith('.pdf')) return 'pdf'
    if (/\.(jpe?g|png|webp|heic|heif)$/.test(name)) return 'photo'
  }
  return null
}

/** What can be sent: a photo (made smaller first) or a PDF up to 10 MB; anything else is refused with a reason. */
export function docProblem(file: { type: string; size: number; name?: string }): string | null {
  const kind = docKind(file)
  if (kind === 'photo') return null
  if (kind !== 'pdf') return 'Pick a photo or a PDF of the document.'
  if (file.size > MAX_DOC_BYTES) return 'This PDF is bigger than 10 MB. Take a photo of the document instead.'
  return null
}

/**
 * The salon's registration document: which one it is (any one of the three will do) and a photo or PDF of it. Only our
 * field team sees it. `save` attaches an uploaded file (or the same file with another type) to the shop; `onBusy`
 * hears while an upload or save is under way.
 */
export function RegistrationDocCard({
  type,
  fileId,
  save,
  remove,
  onBusy,
}: {
  type: RegistrationDocType | null
  fileId: string | null
  save: (type: RegistrationDocType, fileId: string) => Promise<void>
  /** Given: a "Remove it" link next to the document (a wrong one uploaded at registration) */
  remove?: () => Promise<void>
  onBusy?: (busy: boolean) => void
}) {
  const inputId = useId()
  const [chosen, setChosen] = useState<RegistrationDocType | null>(type)
  // The saved kind changed (saved here, or on another phone and read again): the choice shown follows it
  const [shownType, setShownType] = useState(type)
  if (shownType !== type) {
    setShownType(type)
    setChosen(type)
  }
  const [busy, setBusy] = useState(false)
  useEffect(() => onBusy?.(busy), [busy, onBusy])
  const [error, setError] = useState<string | null>(null)
  const link = usePhotoLink(fileId)

  async function pickType(t: RegistrationDocType) {
    setChosen(t)
    setError(null)
    // A file is already there: only its type changes
    if (fileId && t !== type) {
      setBusy(true)
      try {
        await save(t, fileId)
      } catch (e) {
        setChosen(type)   // not saved: the choice shown goes back to the saved one
        setError(explain(e))
      } finally {
        setBusy(false)
      }
    }
  }

  async function picked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !chosen) return
    const problem = docProblem(file)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const pdf = docKind(file) === 'pdf'
      const body = pdf ? new File([file], 'document.pdf', { type: 'application/pdf' }) : await shrinkPhoto(file)
      const stored = await fileApi.upload(body, pdf ? 'document.pdf' : 'document.jpg', 'REG_DOC')
      await save(chosen, stored.id)
    } catch (err) {
      setError(explain(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <p className="font-medium">Registration document (optional)</p>
        <p className="text-sm text-muted">
          Any one of these, if your salon has one. Only our field team sees it; customers see "Registered" on your
          salon's card once our team has checked it, "Unregistered" without one. You can add, change or remove it
          later in the Salon tab.
        </p>
      </div>
      <fieldset className="flex flex-col gap-2" disabled={busy}>
        <legend className="sr-only">Which document</legend>
        {DOC_TYPES.map((d) => (
          <label key={d.type} className="flex min-h-11 items-start gap-3">
            <input
              type="radio"
              name="reg-doc-type"
              className="mt-1 h-5 w-5 accent-brand"
              checked={chosen === d.type}
              onChange={() => pickType(d.type)}
            />
            <span className="flex flex-col">
              <span>{d.label}</span>
              <span className="text-xs text-muted">{d.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <label
        htmlFor={inputId}
        className={`flex min-h-12 items-center justify-center rounded-xl border border-dashed px-3 text-center text-sm ${
          chosen ? 'cursor-pointer border-brand/60 text-link' : 'cursor-not-allowed border-line text-muted'
        } ${busy ? 'pointer-events-none opacity-60' : ''}`}
      >
        {busy ? <Spinner label="Uploading…" /> : fileId ? 'Replace the photo or PDF' : chosen ? 'Take a photo or choose a PDF' : 'Choose which document first'}
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/*,application/pdf"
        className="sr-only"
        aria-label={fileId ? 'Replace the registration document' : 'Add the registration document'}
        disabled={!chosen || busy}
        onChange={picked}
      />
      {fileId && (
        <p className="text-sm">
          Added: {docLabel(type)}.{' '}
          {link.data?.url && (
            <a href={link.data.url} target="_blank" rel="noreferrer" className="text-link underline">
              Open it
            </a>
          )}
          {remove && (
            <>
              {' · '}
              <button
                type="button"
                className="text-bad underline disabled:opacity-50"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  setError(null)
                  try {
                    await remove()
                  } catch (e) {
                    setError(explain(e))
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                Remove it
              </button>
            </>
          )}
        </p>
      )}
      {error && <Banner tone="bad">{error}</Banner>}
    </Card>
  )
}
