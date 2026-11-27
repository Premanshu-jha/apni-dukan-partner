import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { explain, fieldError, isApiError, messageOf, serverText } from '../../api/errors'
import { kiranaApi, kiranaKeys, useKiranaSettings, useOnline, type FssaiView, type KiranaSettings } from '../../api/kirana'
import { fileApi, shopApi, shopKeys, usePhotoLink, useShop } from '../../api/shop'
import type { RegistrationDocType, Shop } from '../../api/types'
import { Banner, Button, Card, Chip, ErrorBanner, ErrorState, Field, Loading, Page, Spinner } from '../../components/ui'
import { hasText, language, t, useT } from '../../i18n'
import { shrinkPhoto } from '../../lib/image'
import { cameFrom, SentBack, Steps } from './Register'
import { shopAsk } from './TeamReasons'
import { useWriteToUsHref } from '../help/HelpButton'
import { PhotoGuide } from '../kirana/Guides'
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
  if (!settings || settings.sellsFood === null || settings.sellsFood === undefined) return t('kiranaRegister.gapFoodQuestion')
  if (!settings.sellsFood) return null
  if (!fssai || fssai.status === 'NONE') return t('kiranaRegister.gapFssaiNeeded')
  if (fssai.status === 'REJECTED') return t('kiranaRegister.gapFssaiRejected')
  if (fssai.status === 'VERIFIED' && fssaiExpired(fssai)) return t('kiranaRegister.gapFssaiExpired')
  return null
}

function FoodQuestion({ settings }: { settings: KiranaSettings }) {
  const t = useT()
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
          {t('kiranaRegister.foodQuestion')}
        </p>
        <p className="text-sm text-muted">{t('kiranaRegister.foodQuestionHint')}</p>
      </div>
      <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby="sells-food">
        <Chip selected={answer === true} disabled={busy !== null} onClick={() => void set(true)}>
          {busy === true ? t('kiranaRegister.saving') : t('kiranaRegister.foodYes')}
        </Chip>
        <Chip selected={answer === false} disabled={busy !== null} onClick={() => void set(false)}>
          {busy === false ? t('kiranaRegister.saving') : t('kiranaRegister.foodNo')}
        </Chip>
      </div>
      {answer === false && (
        <p className="text-sm text-muted">{t('kiranaRegister.foodNoFssaiNeeded')}</p>
      )}
      {error && <ErrorBanner message={error} />}
    </Card>
  )
}

/** The FSSAI licence: the number and the certificate; the AI reads it within a minute (the card follows by itself). */
function FssaiCard({ fssai, onBusy }: { fssai: FssaiView; onBusy: (busy: boolean) => void }) {
  const t = useT()
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
      setLocal(t('kiranaRegister.fssaiNumberFirst'))
      return
    }
    const problem = docProblem(file)
    if (problem) {
      // Neither a photo nor a PDF: said of the FSSAI certificate (docProblem's own words speak of a trade licence)
      setLocal(docKind(file) === null ? t('kiranaRegister.fssaiPickPhotoOrPdf') : problem)
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
      setLocal(t('kiranaRegister.fssaiNumberDigitsSentence'))
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
        <p className="font-semibold">{t('kiranaRegister.fssaiTitle')}</p>
        <p className="text-sm text-muted">{t('kiranaRegister.fssaiIntro')}</p>
      </div>
      <Field
        id="fssai-number"
        label={t('kiranaRegister.fssaiNumberLabel')}
        inputMode="numeric"
        maxLength={20}
        value={number}
        onChange={(e) => setNumber(e.target.value)}
        error={fieldError(error, 'number') ?? (number && !numberOk ? t('kiranaRegister.fssaiNumberDigits') : undefined)}
      />
      <FssaiStatusLine fssai={fssai} />
      {(fssai.status === 'NONE' || fssai.status === 'REJECTED' || (fssai.status === 'VERIFIED' && fssaiExpired(fssai))) && (
        <NoFssaiYet renew={fssai.status === 'VERIFIED'} />
      )}
      {/* Before the upload, not after a refusal (F-08): what the certificate looks like, and that a receipt won't do */}
      {(fssai.status !== 'VERIFIED' || fssaiExpired(fssai)) && fssai.status !== 'CHECKING' && <PhotoGuide kind="fssai" />}
      <p className="text-sm font-medium">{t('kiranaSetup.fssaiNotReceipt')}</p>
      <label
        htmlFor={inputId}
        className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-dashed border-brand/60 px-3 text-center text-sm text-link ${busy || !numberOk ? 'pointer-events-none opacity-60' : ''}`}
      >
        {busy ? (
          <Spinner label={t('kiranaRegister.uploading')} />
        ) : !numberOk ? (
          t('kiranaRegister.fssaiUploadNumberFirst')
        ) : fssai.fileId ? (
          t('kiranaRegister.fssaiUploadAnother')
        ) : (
          t('kiranaRegister.fssaiUploadFirst')
        )}
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/*,application/pdf"
        className="sr-only"
        aria-label={fssai.fileId ? t('kiranaRegister.fssaiReplaceLabel') : t('kiranaRegister.fssaiAddLabel')}
        disabled={busy || !numberOk}
        onChange={picked}
      />
      {fssai.fileId && (
        <p className="text-sm">
          {t('kiranaRegister.fssaiAdded')}{' '}
          {link.data?.url && (
            <a href={link.data.url} target="_blank" rel="noreferrer" className="text-link underline">
              {t('kiranaRegister.openIt')}
            </a>
          )}
          {(changedNumber || fssai.status === 'REJECTED') && (
            <>
              {' · '}
              <button type="button" className="text-link underline disabled:opacity-50" disabled={busy} onClick={() => void resend()}>
                {changedNumber ? t('kiranaRegister.fssaiSaveNewNumber') : t('kiranaRegister.fssaiAskPerson')}
              </button>
            </>
          )}
        </p>
      )}
      {local && <Banner tone="bad">{local}</Banner>}
      {error !== null && !fieldError(error, 'number') && <ErrorBanner message={explain(error)} />}
    </Card>
  )
}

/**
 * For an owner who sells food but has no licence yet (the app can't go on without one): where to get it, what it costs,
 * and that everything typed so far stays.
 */
function NoFssaiYet({ renew }: { renew: boolean }) {
  const t = useT()
  return (
    <details className="rounded-xl border border-line bg-raised p-3 text-sm">
      <summary className="min-h-11 cursor-pointer font-medium text-link">
        {renew ? t('kiranaRegister.noFssaiRenewTitle') : t('kiranaRegister.noFssaiTitle')}
      </summary>
      <div className="mt-2 flex flex-col gap-2 text-muted">
        <p>
          {t('kiranaRegister.noFssaiApplyBefore')}{' '}
          <a href="https://foscos.fssai.gov.in" target="_blank" rel="noreferrer" className="text-link underline">
            foscos.fssai.gov.in
          </a>
          {t('kiranaRegister.noFssaiApplyAfter')} {t('kiranaRegister.noFssaiBasicBefore')}{' '}
          <span className="font-medium text-ink">{t('kiranaRegister.noFssaiBasicName')}</span>{' '}
          {t('kiranaRegister.noFssaiBasicAfter')}
        </p>
        <p>{t('kiranaRegister.noFssaiCsc')}</p>
        <p>{t('kiranaRegister.noFssaiCertificate')}</p>
      </div>
    </details>
  )
}

function FssaiStatusLine({ fssai }: { fssai: FssaiView }) {
  const t = useT()
  switch (fssai.status) {
    case 'NONE':
      return null
    case 'CHECKING':
      // A reason while checking: a person looks at it (after "Ask a person", or the AI gave up), within a day
      return (
        <Banner tone="info">
          {t('kiranaRegister.fssaiChecking', { reason: fssai.reason ? fssaiReasonText(fssai.reason) : t('kiranaRegister.fssaiCheckingDefault') })}
        </Banner>
      )
    case 'VERIFIED':
      if (fssaiExpired(fssai)) return <Banner tone="bad">{t('kiranaRegister.fssaiExpired', { date: shortDate(fssai.validUntil!) })}</Banner>
      return (
        <Banner tone="good">
          {fssai.validUntil ? t('kiranaRegister.fssaiVerifiedUntil', { date: shortDate(fssai.validUntil) }) : t('kiranaRegister.fssaiVerified')}
        </Banner>
      )
    case 'REJECTED':
      return (
        <Banner tone="bad">
          {t('kiranaRegister.notAccepted', { reason: fssai.reason ? fssaiReasonText(fssai.reason) : t('kiranaRegister.fssaiRejectedDefault') })}
          {/* The backend's English reason (as sent) says already when the current licence keeps the shop open */}
          {fssai.currentValidUntil && !fssai.reason?.includes('current licence') && ` ${t('kiranaRegister.fssaiEarlierStillGood', { date: shortDate(fssai.currentValidUntil) })}`}
        </Banner>
      )
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "5 Mar 2027" as the backend writes a day in a reason (KiranaChecks.day) → "2027-03-05"; null if it isn't one. */
function isoDay(day: string): string | null {
  const m = /^(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})$/.exec(day)
  const month = m ? MONTHS.indexOf(m[2]) + 1 : 0
  return m && month ? `${m[3]}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}` : null
}

/** A day in a reason in the app's language (as written when it isn't a day the app can read). */
function reasonDay(day: string): string {
  const iso = isoDay(day)
  return iso ? shortDate(iso) : day
}

/**
 * The FSSAI check's reason (FssaiCheckJob, OnlineService.fssai) in the person's language: a fixed reason through
 * server.json; the ones written with a date, a number or a name in the app's own words; the note on the licence kept
 * meanwhile, which the backend adds at the end, translated on its own. Any other reason (a person's), and every reason
 * in English, as written.
 */
export function fssaiReasonText(reason: string): string {
  if (language() === 'en') return reason // the backend's own words
  if (hasText(`server.${reason}`)) return serverText(reason)
  const kept = /^(.*?) ?Your current licence keeps your shop open until (.+)\.$/.exec(reason)
  if (kept) return join(fssaiReasonText(kept[1]), t('kiranaRegister.fssaiEarlierStillGood', { date: reasonDay(kept[2]) }))
  const ended = /^(.*?) ?Your earlier licence ended on (.+): orders start again once the new one is verified\.$/.exec(reason)
  if (ended) return join(fssaiReasonText(ended[1]), t('kiranaRegister.fssaiReasonEarlierEnded', { date: reasonDay(ended[2]) }))
  const expired = /^(?:This|Your FSSAI) licence expired on (.+)\. Add the renewed certificate\.$/.exec(reason)
  if (expired) return t('kiranaRegister.fssaiReasonExpired', { date: reasonDay(expired[1]) })
  const number = /^The number on the certificate \((.*)\) isn't the one you typed \((.*)\)\. Check the number\.$/.exec(reason)
  if (number) return t('kiranaRegister.fssaiReasonNumber', { printed: number[1], typed: number[2] })
  const name = /^The name on the certificate \((.*)\) doesn't match your shop's name or your name\. Add your own shop's certificate\.$/.exec(reason)
  if (name) return t('kiranaRegister.fssaiReasonName', { name: name[1] })
  return reason
}

function join(first: string, second: string): string {
  return first ? `${first} ${second}` : second
}

/** The two papers, with the language key of each one's short name. */
const DOC_KINDS: { type: RegistrationDocType; label: string }[] = [
  { type: 'TRADE_LICENCE', label: 'kiranaRegister.docTrade' },
  { type: 'SHOPS_ESTABLISHMENT', label: 'kiranaRegister.docShops' },
]

/** A kirana's reason, in its own words (the salon texts speak of the salon): its own text where the salon's differs. */
function kiranaReason(shop: Shop): string {
  const locked = Boolean(shop.addressLocked)
  switch (shop.licenceCheckReason) {
    case 'NAME_MISMATCH':
      return t('kiranaRegister.reasonNameMismatch')
    case 'ADDRESS_MISMATCH':
      return t(locked ? 'kiranaRegister.reasonAddressMismatchLocked' : 'kiranaRegister.reasonAddressMismatch')
    case 'DUPLICATE':
      return t('kiranaRegister.reasonDuplicate')
    default:
      return licenceReasonText(shop.licenceCheckReason, locked)
  }
}

/**
 * Optional: the shop's trade licence or Shops and Establishments certificate (whichever it has), checked
 * automatically against its name and address; customers see "Licensed" once it passed.
 */
function ShopLicenceCard({ onBusy }: { onBusy: (busy: boolean) => void }) {
  const t = useT()
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
      // Neither a photo nor a PDF: said of either paper (docProblem's own words speak of a trade licence only)
      setError(docKind(file) === null ? t('kiranaRegister.shopLicencePickPhotoOrPdf') : problem)
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
  const shopsEstablishment = shop.registrationDocType === 'SHOPS_ESTABLISHMENT'
  const label = shopsEstablishment ? t('kiranaRegister.docShopsLong') : t('kiranaRegister.docTradeLong')
  const kindLabel = t(DOC_KINDS.find((k) => k.type === kind)!.label)
  const failed = Boolean(fileId) && shop.licenceCheck === 'FAILED'
  const canCheckAgain = failed && CHECK_AGAIN_REASONS.includes(shop.licenceCheckReason!)
  const expired = shop.licenceCheck === 'PASSED' && shop.licenceValidUntil !== null && shop.licenceValidUntil !== undefined
    && shop.licenceValidUntil < new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10)
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <p className="font-semibold">{t('kiranaRegister.shopLicenceTitle')}</p>
        <p className="text-sm text-muted">{t('kiranaRegister.shopLicenceIntro')}</p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('kiranaRegister.whichPaper')}>
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
            {t(k.label)}
          </Chip>
        ))}
      </div>
      {fileId && (
        <div aria-live="polite">
          {shop.licenceCheck === 'PENDING' && (
            <Banner tone="info" live={false}>
              {shopsEstablishment ? t('kiranaRegister.shopLicenceCheckingShops') : t('kiranaRegister.shopLicenceCheckingTrade')}
            </Banner>
          )}
          {shop.licenceCheck === 'PASSED' && !expired && (
            <Banner tone="good" live={false}>
              {shop.licenceValidUntil
                ? t('kiranaRegister.shopLicenceCheckedUntil', { date: shortDate(shop.licenceValidUntil) })
                : t('kiranaRegister.shopLicenceCheckedNoEnd')}
            </Banner>
          )}
          {expired && <Banner tone="warn" live={false}>{t('kiranaRegister.shopLicenceExpired', { date: shortDate(shop.licenceValidUntil!) })}</Banner>}
          {failed && <Banner tone="bad" live={false}>{t('kiranaRegister.notAccepted', { reason: kiranaReason(shop) })}</Banner>}
        </div>
      )}
      {(!fileId || failed || expired) && <PhotoGuide kind="shopLicence" />}
      <label
        htmlFor={inputId}
        className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-dashed border-brand/60 px-3 text-center text-sm text-link ${busy ? 'pointer-events-none opacity-60' : ''}`}
      >
        {busy ? (
          <Spinner label={t('kiranaRegister.uploading')} />
        ) : fileId ? (
          t('kiranaRegister.shopLicenceUploadAnother', { doc: kindLabel })
        ) : (
          t('kiranaRegister.shopLicenceUploadFirst', { doc: kindLabel })
        )}
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/*,application/pdf"
        className="sr-only"
        aria-label={fileId ? t('kiranaRegister.shopLicenceReplaceLabel') : t('kiranaRegister.shopLicenceAddLabel')}
        disabled={busy}
        onChange={picked}
      />
      {fileId && (
        <p className="text-sm">
          {t('kiranaRegister.shopLicenceAdded', { doc: label })}{' '}
          {link.data?.url && (
            <a href={link.data.url} target="_blank" rel="noreferrer" className="text-link underline">
              {t('kiranaRegister.openIt')}
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
                {t('kiranaRegister.checkItAgain')}
              </button>
            </>
          )}
          {' · '}
          {removing ? (
            <>
              {t('kiranaRegister.removeAsk')}{' '}
              <button
                type="button"
                className="text-bad underline disabled:opacity-50"
                disabled={busy}
                onClick={() => void run((latest) => shopApi.removeRegistrationDoc(latest.version)).then(() => setRemoving(false))}
              >
                {t('kiranaRegister.removeYes')}
              </button>{' '}
              <button type="button" className="text-link underline" onClick={() => setRemoving(false)}>
                {t('kiranaRegister.removeKeep')}
              </button>
            </>
          ) : (
            <button type="button" className="text-bad underline disabled:opacity-50" disabled={busy} onClick={() => setRemoving(true)}>
              {t('kiranaRegister.removeIt')}
            </button>
          )}
        </p>
      )}
      {error && <ErrorBanner message={error} />}
    </Card>
  )
}

/** Registration's step 3 for a kirana: the food question, its FSSAI licence when it sells food, its shop licence. */
export function RegisterLicences() {
  const t = useT()
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
    <Page back={fromReview ? '/register/review' : '/register/photos'} title={t('kiranaRegister.licencesTitle')} leaveWarning={busy ? t('kiranaRegister.leaveDuringUpload') : null}>
      <Steps at={3} leaveWarning={busy ? t('kiranaRegister.leaveDuringUpload') : null} />
      {shopAsk(shop) && <SentBack ask={shopAsk(shop)!} shop={shop} />}
      <KiranaLicences onBusy={setBusy} />
      <Button disabled={!ready || busy} onClick={() => navigate(fromReview ? '/register/review' : '/register/upi')}>
        {fromReview ? t('kiranaRegister.backToReview') : t('common.continue')}
      </Button>
      {gap && !settings.isPending && (
        // What is missing, and one tap to it (F-09): the food question, or the FSSAI licence's number and certificate
        <button
          type="button"
          className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-warn/50 bg-warn/10 px-4 py-2 text-left text-sm"
          onClick={() => {
            const target = document.getElementById(settings.data?.sellsFood ? 'fssai-number' : 'sells-food')
            target?.scrollIntoView({ block: 'center' })
            if (target instanceof HTMLInputElement) target.focus()
          }}
        >
          <span className="min-w-0 break-words">{gap}</span>
          <span aria-hidden>↑</span>
        </button>
      )}
    </Page>
  )
}

/** More → Licences: the same papers after registration (owner; the route asks a verified shop for the phone code). */
export function KiranaLicencesPage() {
  const t = useT()
  const location = useLocation()
  const [busy, setBusy] = useState(false)
  // Straight to the message form, and back here after sending (not the help page's start)
  const writeToUs = useWriteToUsHref()
  return (
    <Page back={cameFrom(location, '/more')} title={t('kiranaRegister.licencesTitle')} leaveWarning={busy ? t('kiranaRegister.leaveDuringUpload') : null}>
      <KiranaLicences onBusy={setBusy} />
      <p className="text-sm text-muted">
        {t('kiranaRegister.licencesPageNote')}{' '}
        <Link to={writeToUs} className="text-link underline">
          {t('kiranaRegister.licencesPageSupport')}
        </Link>
      </p>
    </Page>
  )
}
