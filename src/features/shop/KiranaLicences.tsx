import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { explain, fieldError, isApiError, messageOf } from '../../api/errors'
import { kiranaApi, kiranaKeys, useKiranaSettings, useOnline, type FssaiView, type KiranaSettings } from '../../api/kirana'
import { fileApi, shopApi, shopKeys, usePhotoLink, useShop } from '../../api/shop'
import type { RegistrationDocType, Shop } from '../../api/types'
import { Banner, Button, Card, Chip, ErrorState, Field, Loading, Page, Spinner } from '../../components/ui'
import { shrinkPhoto } from '../../lib/image'
import { cameFrom, SentBack, Steps } from './Register'
import {
  CHECK_AGAIN_REASONS,
  docKind,
  docProblem,
  licenceReasonText,
  shortDate,
  useLicencePolling,
} from './RegistrationDoc'

/**
 * A kirana's papers, on registration's Licences step and in More → Licences:
 * - "Do you sell any food items (packed or loose)?" (PUT /kirana/settings/sells-food). Yes: the FSSAI licence is
 *   needed before Submit (one still being checked will do; a refused one won't).
 * - The FSSAI licence: the 14-digit number and a photo or PDF of the certificate, read by the AI within a minute.
 * - Optional: a trade licence or a Shops and Establishments certificate, checked automatically ("Licensed").
 */
export function KiranaLicences({ onBusy }: { onBusy?: (busy: boolean) => void }) {
  const settings = useKiranaSettings()
  const online = useOnline()
  const [docBusy, setDocBusy] = useState(false)
  const [fssaiBusy, setFssaiBusy] = useState(false)
  useEffect(() => onBusy?.(docBusy || fssaiBusy), [docBusy, fssaiBusy, onBusy])
  if (settings.isPending) return <Loading />
  if (settings.isError && !settings.data) return <ErrorState message={messageOf(settings.error)} onRetry={() => settings.refetch()} />
  const sellsFood = settings.data.sellsFood ?? null
  return (
    <div className="flex flex-col gap-4">
      <FoodQuestion settings={settings.data} />
      {sellsFood === true &&
        (online.isPending ? (
          <Loading />
        ) : online.isError && !online.data ? (
          <ErrorState message={messageOf(online.error)} onRetry={() => online.refetch()} />
        ) : (
          <FssaiCard fssai={online.data.fssai} onBusy={setFssaiBusy} />
        ))}
      {sellsFood !== null && <ShopLicenceCard onBusy={setDocBusy} />}
    </div>
  )
}

/** Whether the papers let the owner go on: the food question answered, and when it sells food, an FSSAI not refused. */
export function licencesReady(settings: KiranaSettings | undefined, fssai: FssaiView | undefined): boolean {
  if (!settings || settings.sellsFood === null || settings.sellsFood === undefined) return false
  if (!settings.sellsFood) return true
  return fssai?.status === 'CHECKING' || (fssai?.status === 'VERIFIED' && !fssaiExpired(fssai))
}

/** A verified licence whose last day has passed (India's day), as the backend counts it at Submit. */
export function fssaiExpired(fssai: FssaiView): boolean {
  return Boolean(fssai.validUntil) && fssai.validUntil! < new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10)
}

/** What is still missing, in a sentence (under the Continue button). */
export function licencesGap(settings: KiranaSettings | undefined, fssai: FssaiView | undefined): string | null {
  if (!settings || settings.sellsFood === null || settings.sellsFood === undefined) return 'Say whether you sell any food items.'
  if (!settings.sellsFood) return null
  if (!fssai || fssai.status === 'NONE') return 'Your FSSAI licence is needed: you sell food.'
  if (fssai.status === 'REJECTED') return 'Your FSSAI certificate wasn’t accepted: add the right one.'
  if (fssai.status === 'VERIFIED' && fssaiExpired(fssai)) return 'Your FSSAI licence has expired: add the renewed one.'
  return null
}

function FoodQuestion({ settings }: { settings: KiranaSettings }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const answer = settings.sellsFood ?? null
  async function set(sellsFood: boolean) {
    if (answer === sellsFood) return
    setBusy(sellsFood)
    setError(null)
    try {
      qc.setQueryData(kiranaKeys.settings, await kiranaApi.setSellsFood(sellsFood))
    } catch (e) {
      // EDIT_LOCKED: the code sheet comes up (EditGate); after the code, a tap works
      if (!isApiError(e, 'EDIT_LOCKED')) setError(messageOf(e))
    } finally {
      setBusy(null)
    }
  }
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <p id="sells-food" className="font-semibold">
          Do you sell any food items?
        </p>
        <p className="text-sm text-muted">
          Packed or loose: rice, dal, atta, oil, spices, biscuits, snacks, drinks, milk or eggs. Yes needs your FSSAI
          licence (the ₹100 basic registration is enough for most kiranas).
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby="sells-food">
        <Chip selected={answer === true} disabled={busy !== null} onClick={() => void set(true)}>
          {busy === true ? 'Saving…' : 'Yes, some food'}
        </Chip>
        <Chip selected={answer === false} disabled={busy !== null} onClick={() => void set(false)}>
          {busy === false ? 'Saving…' : 'No food at all'}
        </Chip>
      </div>
      {answer === false && (
        <p className="text-sm text-muted">No FSSAI needed. Our field team checks the shop at the visit.</p>
      )}
      {error && <Banner tone="bad">{error}</Banner>}
    </Card>
  )
}

/** The FSSAI licence: the number and the certificate; the AI reads it within a minute (the card follows by itself). */
function FssaiCard({ fssai, onBusy }: { fssai: FssaiView; onBusy: (busy: boolean) => void }) {
  const qc = useQueryClient()
  const inputId = useId()
  const [number, setNumber] = useState(fssai.number ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [local, setLocal] = useState<string | null>(null)
  const link = usePhotoLink(fssai.fileId)
  useEffect(() => {
    onBusy(busy)
    return () => onBusy(false)   // gone mid-upload (the food answer changed to No): nothing is uploading here any more
  }, [busy, onBusy])
  const digits = number.replace(/[\s-]/g, '')
  const numberOk = /^\d{14}$/.test(digits)

  async function send(fileId: string) {
    const saved = await kiranaApi.setFssai(digits, fileId)
    qc.setQueryData(kiranaKeys.online, saved)
  }

  async function picked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setLocal(null)
    setError(null)
    if (!numberOk) {
      setLocal('Type the 14-digit FSSAI number first.')
      return
    }
    const problem = docProblem(file)
    if (problem) {
      setLocal(problem.replace('trade licence', 'FSSAI certificate'))
      return
    }
    setBusy(true)
    try {
      const pdf = docKind(file) === 'pdf'
      const body = pdf ? new File([file], 'fssai.pdf', { type: 'application/pdf' }) : await shrinkPhoto(file)
      const stored = await fileApi.upload(body, pdf ? 'fssai.pdf' : 'fssai.jpg', 'REG_DOC')
      await send(stored.id)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  /** The number corrected (the same certificate), or the same again after a refusal (a person looks at it). */
  async function resend() {
    if (!fssai.fileId) return
    setLocal(null)
    setError(null)
    if (!numberOk) {
      setLocal('An FSSAI number has 14 digits.')
      return
    }
    setBusy(true)
    try {
      await send(fssai.fileId)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  const changedNumber = Boolean(fssai.fileId) && digits !== (fssai.number ?? '')
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <p className="font-semibold">FSSAI licence</p>
        <p className="text-sm text-muted">
          The 14-digit number and a photo or PDF of your FSSAI registration or licence certificate. We check it
          automatically, usually within a minute.
        </p>
      </div>
      <Field
        id="fssai-number"
        label="FSSAI number"
        inputMode="numeric"
        maxLength={20}
        value={number}
        onChange={(e) => setNumber(e.target.value)}
        error={fieldError(error, 'number') ?? (number && !numberOk ? 'An FSSAI number has 14 digits' : undefined)}
      />
      <FssaiStatusLine fssai={fssai} />
      {(fssai.status === 'NONE' || fssai.status === 'REJECTED' || (fssai.status === 'VERIFIED' && fssaiExpired(fssai))) && (
        <NoFssaiYet renew={fssai.status === 'VERIFIED'} />
      )}
      <label
        htmlFor={inputId}
        className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-dashed border-brand/60 px-3 text-center text-sm text-link ${busy || !numberOk ? 'pointer-events-none opacity-60' : ''}`}
      >
        {busy ? (
          <Spinner label="Uploading…" />
        ) : !numberOk ? (
          'Type the 14-digit number above first, then add the certificate'
        ) : fssai.fileId ? (
          'Upload another photo or PDF'
        ) : (
          'Take a photo or choose a PDF of the certificate'
        )}
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/*,application/pdf"
        className="sr-only"
        aria-label={fssai.fileId ? 'Replace the FSSAI certificate' : 'Add the FSSAI certificate'}
        disabled={busy || !numberOk}
        onChange={picked}
      />
      {fssai.fileId && (
        <p className="text-sm">
          Added.{' '}
          {link.data?.url && (
            <a href={link.data.url} target="_blank" rel="noreferrer" className="text-link underline">
              Open it
            </a>
          )}
          {(changedNumber || fssai.status === 'REJECTED') && (
            <>
              {' · '}
              <button type="button" className="text-link underline disabled:opacity-50" disabled={busy} onClick={() => void resend()}>
                {changedNumber ? 'Save the new number' : 'Ask a person to check it'}
              </button>
            </>
          )}
        </p>
      )}
      {local && <Banner tone="bad">{local}</Banner>}
      {error !== null && !fieldError(error, 'number') && <Banner tone="bad">{explain(error)}</Banner>}
    </Card>
  )
}

/**
 * For an owner who sells food but has no licence yet (the app can't go on without one): where to get it, what it costs,
 * and that everything typed so far stays.
 */
function NoFssaiYet({ renew }: { renew: boolean }) {
  return (
    <details className="rounded-xl border border-line bg-raised p-3 text-sm">
      <summary className="min-h-11 cursor-pointer font-medium text-link">
        {renew ? 'How do I renew my FSSAI licence?' : 'Don’t have an FSSAI licence yet?'}
      </summary>
      <div className="mt-2 flex flex-col gap-2 text-muted">
        <p>
          Apply online on the government’s FoSCoS site:{' '}
          <a href="https://foscos.fssai.gov.in" target="_blank" rel="noreferrer" className="text-link underline">
            foscos.fssai.gov.in
          </a>
          . Most kiranas need only the <span className="font-medium text-ink">Basic Registration</span> (Form A), ₹100 a
          year, paid there. You get the 14-digit number and the certificate online, usually within a few days.
        </p>
        <p>
          The certificate is the registration PDF you get once it is approved, not the payment or application receipt.
          What you’ve already saved (your answers, photos and video) stays. Come back with the number and the
          certificate together to finish.
        </p>
      </div>
    </details>
  )
}

function FssaiStatusLine({ fssai }: { fssai: FssaiView }) {
  switch (fssai.status) {
    case 'NONE':
      return null
    case 'CHECKING':
      // A reason while checking: a person looks at it (after "Ask a person", or the AI gave up), within a day
      return (
        <Banner tone="info">
          {fssai.reason ?? 'Checking your FSSAI certificate. This usually takes under a minute.'} You can go on meanwhile.
        </Banner>
      )
    case 'VERIFIED':
      if (fssaiExpired(fssai)) return <Banner tone="bad">It expired on {shortDate(fssai.validUntil!)}. Upload the renewed licence.</Banner>
      return <Banner tone="good">Verified{fssai.validUntil ? `, valid until ${shortDate(fssai.validUntil)}` : ''}.</Banner>
    case 'REJECTED':
      return (
        <Banner tone="bad">
          Not accepted. {fssai.reason ?? 'Upload a clear photo or the PDF of your FSSAI certificate.'}
          {fssai.currentValidUntil && !fssai.reason?.includes('current licence') && ` Your earlier licence stays good until ${shortDate(fssai.currentValidUntil)}.`}
        </Banner>
      )
  }
}

const DOC_KINDS: { type: RegistrationDocType; label: string }[] = [
  { type: 'TRADE_LICENCE', label: 'Trade licence' },
  { type: 'SHOPS_ESTABLISHMENT', label: 'Shops & Establishments' },
]

/** A kirana's reason, in its own words (the salon texts speak of the salon). */
function kiranaReason(shop: Shop): string {
  return licenceReasonText(shop.licenceCheckReason, Boolean(shop.addressLocked))
    .replace(/salon’s/g, 'shop’s')
    .replace(/another salon/g, 'another shop')
    .replace(/Salon details/g, 'More → Edit (shop details)')
}

/**
 * Optional: the shop's trade licence or Shops and Establishments certificate (whichever it has), checked
 * automatically against its name and address; customers see "Licensed" once it passed.
 */
function ShopLicenceCard({ onBusy }: { onBusy: (busy: boolean) => void }) {
  const qc = useQueryClient()
  const shop = useShop()
  const inputId = useId()
  const [kind, setKind] = useState<RegistrationDocType>(
    shop.registrationDocType === 'SHOPS_ESTABLISHMENT' ? 'SHOPS_ESTABLISHMENT' : 'TRADE_LICENCE',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const link = usePhotoLink(shop.registrationDocFileId ?? null)
  useEffect(() => {
    onBusy(busy)
    return () => onBusy(false)   // gone mid-upload (the food answer changed to No): nothing is uploading here any more
  }, [busy, onBusy])
  const checking = Boolean(shop.registrationDocFileId) && shop.licenceCheck === 'PENDING'
  useLicencePolling(checking)

  async function run(work: (latest: Shop) => Promise<Shop>) {
    setBusy(true)
    setError(null)
    try {
      const latest = qc.getQueryData<Shop>(shopKeys.mine) ?? shop
      qc.setQueryData(shopKeys.mine, await work(latest))
    } catch (e) {
      if (isApiError(e, 'SHOP_CHANGED')) await qc.invalidateQueries({ queryKey: shopKeys.mine })
      if (!isApiError(e, 'EDIT_LOCKED')) setError(explain(e))
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
      setError(problem.replace('trade licence', 'licence or certificate'))
      return
    }
    await run(async (latest) => {
      const pdf = docKind(file) === 'pdf'
      const body = pdf ? new File([file], 'licence.pdf', { type: 'application/pdf' }) : await shrinkPhoto(file)
      const stored = await fileApi.upload(body, pdf ? 'licence.pdf' : 'licence.jpg', 'REG_DOC')
      return shopApi.setRegistrationDoc(latest.version, kind, stored.id)
    })
  }

  const fileId = shop.registrationDocFileId ?? null
  const label = shop.registrationDocType === 'SHOPS_ESTABLISHMENT' ? 'Shops and Establishments certificate' : 'Trade licence'
  const failed = Boolean(fileId) && shop.licenceCheck === 'FAILED'
  const canCheckAgain = failed && CHECK_AGAIN_REASONS.includes(shop.licenceCheckReason!)
  const expired = shop.licenceCheck === 'PASSED' && shop.licenceValidUntil !== null && shop.licenceValidUntil !== undefined
    && shop.licenceValidUntil < new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10)
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <p className="font-semibold">Trade licence or Shops & Establishments (optional)</p>
        <p className="text-sm text-muted">
          Whichever your shop has, from your municipality or the labour department. We check it automatically against
          your shop’s name and address, and customers see “Licensed” on your shop. No paper? Your shop works the same,
          with no badge.
        </p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Which paper">
        {DOC_KINDS.map((k) => (
          <Chip
            key={k.type}
            selected={kind === k.type}
            disabled={busy}
            onClick={() => {
              setKind(k.type)
              // Already added as the other paper: the same file is checked again as this one, no new photo needed
              const added = shop.registrationDocFileId
              if (added && shop.registrationDocType !== k.type) {
                void run((latest) => shopApi.setRegistrationDoc(latest.version, k.type, added))
              }
            }}
          >
            {k.label}
          </Chip>
        ))}
      </div>
      {fileId && (
        <div aria-live="polite">
          {shop.licenceCheck === 'PENDING' && (
            <Banner tone="info" live={false}>Checking your {label.toLowerCase()}. This usually takes under a minute; you can go on meanwhile.</Banner>
          )}
          {shop.licenceCheck === 'PASSED' && !expired && (
            <Banner tone="good" live={false}>
              Checked: customers see “Licensed” on your shop{shop.licenceValidUntil ? ` until ${shortDate(shop.licenceValidUntil)}` : ' (no end date on it)'}.
            </Banner>
          )}
          {expired && <Banner tone="warn" live={false}>It expired on {shortDate(shop.licenceValidUntil!)}. Upload the renewed one.</Banner>}
          {failed && <Banner tone="bad" live={false}>Not accepted. {kiranaReason(shop)}</Banner>}
        </div>
      )}
      <label
        htmlFor={inputId}
        className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-dashed border-brand/60 px-3 text-center text-sm text-link ${busy ? 'pointer-events-none opacity-60' : ''}`}
      >
        {busy ? <Spinner label="Uploading…" /> : fileId ? `Upload another (${DOC_KINDS.find((k) => k.type === kind)!.label})` : `Take a photo or choose a PDF (${DOC_KINDS.find((k) => k.type === kind)!.label})`}
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/*,application/pdf"
        className="sr-only"
        aria-label={fileId ? 'Replace the shop licence' : 'Add the shop licence'}
        disabled={busy}
        onChange={picked}
      />
      {fileId && (
        <p className="text-sm">
          Added: {label}.{' '}
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
                onClick={() => void run((latest) => shopApi.setRegistrationDoc(latest.version, latest.registrationDocType ?? kind, fileId))}
              >
                Check it again
              </button>
            </>
          )}
          {' · '}
          {removing ? (
            <>
              Remove it?{' '}
              <button
                type="button"
                className="text-bad underline disabled:opacity-50"
                disabled={busy}
                onClick={() => void run((latest) => shopApi.removeRegistrationDoc(latest.version)).then(() => setRemoving(false))}
              >
                Yes, remove
              </button>{' '}
              <button type="button" className="text-link underline" onClick={() => setRemoving(false)}>
                Keep it
              </button>
            </>
          ) : (
            <button type="button" className="text-bad underline disabled:opacity-50" disabled={busy} onClick={() => setRemoving(true)}>
              Remove it
            </button>
          )}
        </p>
      )}
      {error && <Banner tone="bad">{error}</Banner>}
    </Card>
  )
}

const LEAVE_DURING_UPLOAD = 'A paper is still uploading. Leave anyway? It may not be saved.'

/** Registration's step 3 for a kirana: the food question, its FSSAI licence when it sells food, its shop licence. */
export function RegisterLicences() {
  const navigate = useNavigate()
  const shop = useShop()
  const location = useLocation()
  const fromReview = new URLSearchParams(location.search).get('from') === 'review'
  const settings = useKiranaSettings()
  const online = useOnline()
  const [busy, setBusy] = useState(false)
  const ready = licencesReady(settings.data, online.data?.fssai)
  const gap = licencesGap(settings.data, online.data?.fssai)
  return (
    <Page back={fromReview ? '/register/review' : '/register/photos'} title="Licences" leaveWarning={busy ? LEAVE_DURING_UPLOAD : null}>
      <Steps at={3} leaveWarning={busy ? LEAVE_DURING_UPLOAD : null} />
      {shop.statusReason && <SentBack reason={shop.statusReason} />}
      <KiranaLicences onBusy={setBusy} />
      <Button disabled={!ready || busy} onClick={() => navigate(fromReview ? '/register/review' : '/register/upi')}>
        {fromReview ? 'Back to the review' : 'Continue'}
      </Button>
      {gap && !settings.isPending && <p className="text-center text-sm text-muted">{gap}</p>}
    </Page>
  )
}

/** More → Licences: the same papers after registration (owner; the route asks a verified shop for the phone code). */
export function KiranaLicencesPage() {
  const location = useLocation()
  const [busy, setBusy] = useState(false)
  return (
    <Page back={cameFrom(location, '/more')} title="Licences" leaveWarning={busy ? LEAVE_DURING_UPLOAD : null}>
      <KiranaLicences onBusy={setBusy} />
      <p className="text-sm text-muted">
        Every paper you add is checked automatically; your shop stays open meanwhile.{' '}
        <Link to="/help" className="text-link underline">
          Questions? Write to support
        </Link>
      </p>
    </Page>
  )
}
