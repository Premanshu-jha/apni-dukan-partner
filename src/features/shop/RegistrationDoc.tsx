import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import { explain } from '../../api/errors'
import { fileApi, shopKeys, usePhotoLink } from '../../api/shop'
import type { LicenceCheck, LicenceCheckReason, LicenceRead, RegistrationDocType } from '../../api/types'
import { Banner, Card, Spinner } from '../../components/ui'
import { shrinkPhoto } from '../../lib/image'

/** The backend takes files up to 10 MB. */
export const MAX_DOC_BYTES = 10 * 1024 * 1024

/**
 * How often the shop is read again while the licence is being checked (it usually takes under a minute).
 * VITE_LICENCE_POLL_MS: shorter in the end-to-end tests only.
 */
export const LICENCE_POLL_MS = Number(import.meta.env.VITE_LICENCE_POLL_MS) || 8_000
/** After this long on the screen, a check still going is read again only every LICENCE_SLOW_POLL_MS. */
export const LICENCE_FAST_FOR_MS = 3 * 60_000
export const LICENCE_SLOW_POLL_MS = 30_000
/** A check waiting longer than this is "taking longer than usual" (the AI is down, or not set up yet). */
export const LICENCE_SLOW_AFTER_MS = 10 * 60_000

const LABELS: Record<RegistrationDocType, string> = {
  TRADE_LICENCE: 'Trade licence',
  SHOPS_ESTABLISHMENT: 'Shops and Establishments certificate',
  UDYAM: 'Udyam certificate',
}

export function docLabel(type: RegistrationDocType | null | undefined): string | null {
  return type ? LABELS[type] : null
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
  if (kind !== 'pdf') return 'Pick a photo or a PDF of your trade licence.'
  if (file.size > MAX_DOC_BYTES) return 'This PDF is bigger than 10 MB. Take a photo of the licence instead.'
  return null
}

/** Every reason the backend gives (LicenceCheckReason): the compiler checks each has its text. */
const REASONS: Record<LicenceCheckReason, (addressLocked: boolean) => string> = {
  UNREADABLE: () => 'We couldn’t read it. Take a clear, well-lit photo of the whole licence, or upload the PDF.',
  NOT_TRADE_LICENCE: () => 'It isn’t a municipal trade licence. Upload your trade licence from GHMC or your municipality.',
  LOOKS_EDITED: () => 'It looks edited. Upload the licence exactly as you got it.',
  NO_NUMBER: () => 'We couldn’t find the licence number on it. Make sure the whole licence is in the photo.',
  NOT_A_SALON_TRADE: () => 'It is a licence for another kind of business, not a salon.',
  NO_VALIDITY: () => 'We couldn’t find until when it is valid. Make sure the dates are in the photo.',
  EXPIRED: () => 'It has expired. Upload the renewed licence.',
  NAME_MISMATCH: () =>
    'The name on it doesn’t match your salon’s name or the owner’s name. If your details are wrong, change them in Salon details: the licence is checked again by itself.',
  ADDRESS_MISMATCH: (locked) =>
    locked
      ? 'The address on it doesn’t match your salon’s address. If your address is wrong, ask our field team to change it (Salon details → Request address change): once they do, the licence is checked again by itself.'
      : 'The address on it doesn’t match your salon’s address. If your address is wrong, change it in Salon details: the licence is checked again by itself.',
  DUPLICATE: () => 'This licence is already used by another salon. If it is yours, write to support and we’ll sort it out.',
  NOT_READ: () => 'We couldn’t read it. Try a clearer photo, or the PDF.',
}

/**
 * Why a licence wasn't accepted, and what to do, in the owner's words (LicenceCheckJob.explain on the backend).
 * `addressLocked`: the address was verified by our field team, so only they change it (a request).
 */
export function licenceReasonText(reason: LicenceCheckReason | null | undefined, addressLocked = false): string {
  const text = reason ? REASONS[reason] : undefined
  return text ? text(addressLocked) : 'Upload another photo or the PDF of your trade licence.'
}

export const ALL_REASONS = Object.keys(REASONS) as LicenceCheckReason[]

/** Reasons the same licence may pass when checked again (the owner fixed his details, or a read went wrong). */
export const CHECK_AGAIN_REASONS: ReadonlyArray<LicenceCheckReason> = ['NAME_MISMATCH', 'ADDRESS_MISMATCH', 'NOT_READ']

/** "31 Mar 2027" from "2027-03-31". */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/** Today's date in India (YYYY-MM-DD), the day the licence's last valid day is compared with. */
export function indiaToday(now = new Date()): string {
  return new Date(now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10)
}

export type LicenceState = 'NONE' | 'CHECKING' | 'LICENSED' | 'EXPIRED' | 'NOT_ACCEPTED' | 'OLD_KIND'

/** The salon's licence as the screens need it (the owner's GET /shops/me). */
export interface LicenceShop {
  registrationDocFileId?: string | null
  registrationDocType?: RegistrationDocType | null
  licenceCheck?: LicenceCheck | null
  licenceCheckReason?: LicenceCheckReason | null
  licenceValidUntil?: string | null
  licenceCheckSince?: string | null
  licenceRead?: LicenceRead | null
  addressLocked?: boolean
}

/** Where the salon's licence stands, as the owner should see it. */
export function licenceState(shop: LicenceShop, today = indiaToday()): LicenceState {
  if (!shop.registrationDocFileId) return 'NONE'
  if (shop.registrationDocType && shop.registrationDocType !== 'TRADE_LICENCE') return 'OLD_KIND'
  if (shop.licenceCheck === 'PASSED') return shop.licenceValidUntil && shop.licenceValidUntil < today ? 'EXPIRED' : 'LICENSED'
  if (shop.licenceCheck === 'FAILED') return 'NOT_ACCEPTED'
  return 'CHECKING'
}

/** One line for lists (the Salon tab, More): where the licence stands. */
export function licenceSummary(shop: LicenceShop): string {
  switch (licenceState(shop)) {
    case 'NONE':
      return 'Not added (optional): no "Licensed" badge'
    case 'CHECKING':
      return 'Being checked'
    case 'LICENSED':
      return `Checked: customers see "Licensed" until ${shortDate(shop.licenceValidUntil!)}`
    case 'EXPIRED':
      return 'Expired: add the renewed licence'
    case 'NOT_ACCEPTED':
      return 'Not accepted: open to see why'
    case 'OLD_KIND':
      return 'Only a trade licence counts now: add yours'
  }
}

/**
 * While the licence is being checked, the shop is read again by itself (only while this screen shows and the phone's
 * screen is on), so the answer appears: every few seconds at first, then every 30 seconds, so a check that waits on
 * the AI being down, or on its key being set, doesn't cost a read every few seconds for hours.
 */
export function useLicencePolling(checking: boolean) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!checking) return
    const started = Date.now()
    let timer = 0
    const next = () => {
      const wait = Date.now() - started < LICENCE_FAST_FOR_MS ? LICENCE_POLL_MS : LICENCE_SLOW_POLL_MS
      timer = window.setTimeout(() => {
        if (document.visibilityState === 'visible') void qc.invalidateQueries({ queryKey: shopKeys.mine, exact: true })
        next()
      }, wait)
    }
    next()
    return () => window.clearTimeout(timer)
  }, [checking, qc])
}

/** "Checking…", which turns into "taking longer than usual" by itself once the check waits over 10 minutes. */
function CheckingBanner({ since, now }: { since?: string | null; now: number }) {
  const started = since ? Date.parse(since) : NaN
  const slowAt = Number.isFinite(started) ? started + LICENCE_SLOW_AFTER_MS : Infinity
  const [slow, setSlow] = useState(() => now > slowAt)
  useEffect(() => {
    if (now > slowAt) { setSlow(true); return }
    setSlow(false)
    if (!Number.isFinite(slowAt)) return
    // A poll that finds the same answer doesn't re-render this, so it is timed by itself
    const timer = window.setTimeout(() => setSlow(true), slowAt - now + 50)
    return () => window.clearTimeout(timer)
  }, [now, slowAt])
  return (
    <Banner tone="info">
      {slow
        ? 'Checking your trade licence is taking longer than usual. We’ll send you a message when it’s done; nothing else about your salon changes meanwhile.'
        : 'Checking your trade licence. This usually takes under a minute; you can leave this page.'}
    </Banner>
  )
}

/** The licence's state, in a banner (and, when it wasn't accepted for a name or an address, what was read). */
export function LicenceStatus({ shop, now = Date.now() }: { shop: LicenceShop; now?: number }) {
  switch (licenceState(shop)) {
    case 'NONE':
      return null
    case 'CHECKING':
      return <CheckingBanner since={shop.licenceCheckSince} now={now} />
    case 'LICENSED':
      return <Banner tone="good">Checked: customers see "Licensed" on your salon until {shortDate(shop.licenceValidUntil!)}.</Banner>
    case 'EXPIRED':
      return (
        <Banner tone="warn">
          Your trade licence expired on {shortDate(shop.licenceValidUntil!)}: customers no longer see "Licensed". Upload the renewed licence.
        </Banner>
      )
    case 'NOT_ACCEPTED': {
      const read = shop.licenceRead
      const showRead = Boolean(read) && (shop.licenceCheckReason === 'NAME_MISMATCH' || shop.licenceCheckReason === 'ADDRESS_MISMATCH')
      const names = read ? [read.tradeName, read.ownerName].filter(Boolean).join(' · ') : ''
      const place = read ? [read.address, read.pincode].filter(Boolean).join(' ') : ''
      return (
        <Banner tone="bad">
          <span className="flex flex-col gap-2">
            <span>Not accepted. {licenceReasonText(shop.licenceCheckReason, Boolean(shop.addressLocked))}</span>
            {showRead && (
              <span>
                On the licence we read: {names || 'no name'}
                {place ? `; ${place}` : ''}.
              </span>
            )}
            <Link to="/help" className="text-link underline">
              Write to support
            </Link>
          </span>
        </Banner>
      )
    }
    case 'OLD_KIND':
      return (
        <Banner tone="warn">
          Only a municipal trade licence counts now. Replace your {docLabel(shop.registrationDocType)?.toLowerCase()} with your trade licence to show "Licensed".
        </Banner>
      )
  }
}

/**
 * The salon's trade licence: a photo or PDF of it, checked automatically. Only our field team and the check see it;
 * customers see "Licensed" on the salon once it passed. `save` attaches an uploaded file to the shop (the same file
 * again checks it again after it wasn't accepted for a name or an address); `onBusy` hears while an upload or save is
 * under way.
 */
export function RegistrationDocCard({
  shop,
  save,
  remove,
  onBusy,
}: {
  shop: LicenceShop
  save: (type: RegistrationDocType, fileId: string) => Promise<void>
  /** Given: a "Remove it" link next to the licence (a wrong one uploaded at registration) */
  remove?: () => Promise<void>
  onBusy?: (busy: boolean) => void
}) {
  const inputId = useId()
  const [busy, setBusy] = useState(false)
  useEffect(() => onBusy?.(busy), [busy, onBusy])
  const [error, setError] = useState<string | null>(null)
  const fileId = shop.registrationDocFileId ?? null
  const link = usePhotoLink(fileId)
  const state = licenceState(shop)
  useLicencePolling(state === 'CHECKING')
  // Where the focus goes after Check it again or Remove it took away the button it was on
  const statusRef = useRef<HTMLDivElement>(null)

  async function run(work: () => Promise<void>, refocus = false) {
    setBusy(true)
    setError(null)
    try {
      await work()
      if (refocus) statusRef.current?.focus()
    } catch (err) {
      setError(explain(err))
    } finally {
      setBusy(false)
    }
  }

  async function picked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const problem = docProblem(file)
    if (problem) {
      setError(problem)
      return
    }
    await run(async () => {
      const pdf = docKind(file) === 'pdf'
      const body = pdf ? new File([file], 'licence.pdf', { type: 'application/pdf' }) : await shrinkPhoto(file)
      const stored = await fileApi.upload(body, pdf ? 'licence.pdf' : 'licence.jpg', 'REG_DOC')
      await save('TRADE_LICENCE', stored.id)
    })
  }

  // Not accepted for the salon's name or address (fixed since, which checks it again by itself, or the owner thinks
  // the check got it wrong), or not read: the same licence can be checked again without uploading it again. Not for
  // reasons another check can't change (an edited or expired licence, another salon's), nor an old Udyam certificate.
  const canCheckAgain = Boolean(fileId) && state === 'NOT_ACCEPTED' && CHECK_AGAIN_REASONS.includes(shop.licenceCheckReason!)

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <p className="font-medium">Trade licence (optional)</p>
        <p className="text-sm text-muted">
          Add a photo or PDF of your salon’s trade licence (GHMC, Cyberabad, Malkajgiri or your municipality) and get
          "Licensed" on your salon. We check it automatically against your salon’s name and address. No licence? Your
          salon stays open as it is, with no badge.
        </p>
      </div>
      <div ref={statusRef} tabIndex={-1} className="outline-none">
        <LicenceStatus shop={shop} />
      </div>
      <label
        htmlFor={inputId}
        className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-dashed border-brand/60 px-3 text-center text-sm text-link ${
          busy ? 'pointer-events-none opacity-60' : ''
        }`}
      >
        {busy ? <Spinner label="Uploading…" /> : fileId ? 'Upload another photo or PDF' : 'Take a photo or choose a PDF'}
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/*,application/pdf"
        className="sr-only"
        aria-label={fileId ? 'Replace the trade licence' : 'Add the trade licence'}
        disabled={busy}
        onChange={picked}
      />
      {fileId && (
        <p className="text-sm">
          Added: {docLabel(shop.registrationDocType)}.{' '}
          {link.data?.url && (
            <a href={link.data.url} target="_blank" rel="noreferrer" className="text-link underline">
              Open it
            </a>
          )}
          {canCheckAgain && (
            <>
              {' · '}
              <button
                type="button"
                className="text-link underline disabled:opacity-50"
                disabled={busy}
                onClick={() => run(() => save('TRADE_LICENCE', fileId!), true)}
              >
                Check it again
              </button>
            </>
          )}
          {remove && (
            <>
              {' · '}
              <button type="button" className="text-bad underline disabled:opacity-50" disabled={busy} onClick={() => run(remove, true)}>
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
