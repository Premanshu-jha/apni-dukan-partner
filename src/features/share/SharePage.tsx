import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router'
import { usePause, useServices, useStaff } from '../../api/salon'
import { useShop } from '../../api/shop'
import { useSubscription } from '../../api/subscription'
import { Banner, Button, Card, Page } from '../../components/ui'
import { useLanguage, useT } from '../../i18n'
import { dateTimeIst } from '../../lib/ist'
import { can } from '../../lib/roles'
import { useNow } from '../../lib/useNow'
import { SubscriptionBanner } from '../subscription/SubscriptionBanner'
import { linkState, posterFileName, salonLink, whatsMissing, whatsappHref, type Missing } from './link'
import { drawPoster, posterBlob } from './poster'
import './share.css'
import { useWriteToUsHref } from '../help/HelpButton'
import { cameFrom } from '../shop/Register'

/**
 * "How do I get customers on Clozest?": the salon's own link, sent in one tap (WhatsApp, the phone's share sheet, or
 * copied), and a poster for the counter with its QR. Anyone in the salon (owner, helper, barber: a barber shares with
 * his own regulars too); the link is the salon's public page, nothing private.
 *
 * Before the salon is live (or while it is suspended) the link answers "No such salon." in the customer app, so the
 * page says so and offers nothing to send or print: a poster put up early, or a message sent now, would only show
 * customers a dead page, which is worse than waiting a few days.
 */
export function SharePage() {
  const t = useT()
  const shop = useShop()
  const state = linkState(shop.status)
  const writeToUs = useWriteToUsHref()
  const location = useLocation()
  return (
    // Back where it was opened from (the Salon tab, Today's setup card, More), else More
    <Page back={cameFrom(location, '/more')} title={t('share.title')}>
      {state === 'live' ? (
        <Live />
      ) : state === 'suspended' ? (
        <Banner tone="bad" live={false}>
          <span className="flex flex-col gap-2">
            <span className="font-semibold">{t('share.suspendedTitle')}</span>
            <span>{t('share.suspendedBody')}</span>
            <span className="flex flex-wrap gap-x-4">
              <Link to="/" className="inline-flex min-h-11 items-center font-medium underline">
                {t('share.suspendedHome')}
              </Link>
              <Link to={writeToUs} className="inline-flex min-h-11 items-center font-medium underline">
                {t('share.writeToUs')}
              </Link>
            </span>
          </span>
        </Banner>
      ) : (
        <Card className="flex flex-col gap-2">
          <p className="font-semibold">{t('share.notLiveTitle')}</p>
          <p className="text-sm text-muted">{t('share.notLiveBody')}</p>
        </Card>
      )}
    </Page>
  )
}

function Live() {
  const t = useT()
  const shop = useShop()
  const link = salonLink(shop.id)
  return (
    <>
      <p className="text-muted">{t('share.intro')}</p>
      <WhatCustomersSee />
      <LinkCard link={link} salon={shop.name} />
      <PosterCard link={link} salon={shop.name} />
    </>
  )
}

/**
 * Whether a customer opening the link today can book: the salon's subscription (its own banner, as on Today: the same
 * rule and words) and the pause (Today's "Pause online bookings"). The link still opens the salon's page in both, so
 * sharing stays on; the owner is told what customers will see and what to do.
 */
function WhatCustomersSee() {
  const t = useT()
  const shop = useShop()
  const sub = useSubscription()
  const pause = usePause()
  const now = useNow()
  const until = pause.data?.pausedUntil
  const paused = Boolean(until && Date.parse(until) > now)
  // As SubscriptionBanner's own "hidden" case (state HIDDEN while enforced): out of search, the page can't book
  const hidden = sub.data?.state === 'HIDDEN' && sub.data.enforced
  return (
    <>
      <NotBookable />
      <SubscriptionBanner />
      {hidden && <p className="text-sm text-bad">{t('share.hiddenNow')}</p>}
      {paused && (
        <Banner tone="warn" live={false}>
          {t('share.paused', { time: dateTimeIst(until!) })}{' '}
          {can(shop.myRole).pause && (
            // A full-size tap target (44 px), not a line of small text
            <Link to="/salon/day" className="inline-flex min-h-11 items-center font-medium underline">
              {t('share.resumeLink')}
            </Link>
          )}
        </Banner>
      )}
    </>
  )
}

const FIX: Record<Missing, { text: string; button: string; to: string }> = {
  services: { text: 'share.notReadyServices', button: 'share.fixServices', to: '/setup/services' },
  barbers: { text: 'share.notReadyBarbers', button: 'share.fixBarbers', to: '/setup/staff' },
  hours: { text: 'share.notReadyHours', button: 'share.fixBarbers', to: '/setup/staff' },
}

/**
 * A live salon customers still can't book (no service, no barber, or no barber with hours and services: Today's
 * checklist rule): said, with the owner's way to fix it in one tap (helpers and barbers: ask the owner, who alone
 * edits the setup). Sharing stays: the link works as soon as it is fixed. The services and barbers are the lists the
 * app already reads (Today, Setup): cached, no extra request when they are in; nothing is said until both are.
 */
function NotBookable() {
  const t = useT()
  const shop = useShop()
  const services = useServices()
  const staff = useStaff()
  if (!services.data || !staff.data) return null
  const missing = whatsMissing(services.data, staff.data)
  if (!missing) return null
  const fix = FIX[missing]
  return (
    <Banner tone="warn" live={false}>
      <span className="flex flex-col gap-2">
        <span>{t(fix.text)}</span>
        {can(shop.myRole).editSetup ? (
          <>
            <span>{t('share.notReadyShareAnyway')}</span>
            <Link to={fix.to} className="inline-flex min-h-11 items-center justify-center self-start rounded-xl border border-warn/60 px-4 font-medium">
              {t(fix.button)}
            </Link>
          </>
        ) : (
          <span>{t('share.notReadyAskOwner', { name: shop.ownerName })}</span>
        )}
      </span>
    </Banner>
  )
}

function WhatsAppIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.2.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.6-.3Z" />
    </svg>
  )
}

function LinkCard({ link, salon }: { link: string; salon: string }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const message = t('share.message', { salon, link })
  // The phone's own share sheet (Android, iPhone); a computer's browser often has none, and then no button
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function copy() {
    setCopyFailed(false)
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // No clipboard (an old browser, or not allowed): the link is selected, to copy by hand
      setCopyFailed(true)
      input.current?.focus()
      input.current?.select()
    }
  }

  async function share() {
    try {
      await navigator.share({ title: t('share.shareTitle', { salon }), text: message })
    } catch {
      // Closed without sending (AbortError), or the phone refused: nothing to say, the buttons are still here
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-semibold">{t('share.linkTitle')}</h2>
      <input
        ref={input}
        readOnly
        value={link}
        aria-label={t('share.linkLabel')}
        onFocus={(e) => e.currentTarget.select()}
        className="min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-sm text-ink"
      />
      <p className="text-sm text-muted">{t('share.customersSee')}</p>
      <a
        href={whatsappHref(message)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand bg-linear-to-br from-brand to-brand-deep px-5 font-semibold text-brand-ink shadow-lg shadow-brand/25 hover:brightness-110"
      >
        <WhatsAppIcon />
        {t('share.whatsapp')}
      </a>
      <div className="flex gap-2">
        {canShare && (
          <Button variant="secondary" className="flex-1" onClick={() => void share()}>
            {t('share.share')}
          </Button>
        )}
        <Button variant="secondary" className="flex-1" onClick={() => void copy()}>
          <span aria-live="polite">{copied ? t('share.copied') : t('share.copy')}</span>
        </Button>
      </div>
      {copyFailed && <p className="text-sm text-warn">{t('share.copyFailed')}</p>}
    </Card>
  )
}

type Drawn = { url: string; file: string; blob: Blob } | 'drawing' | 'failed'

function PosterCard({ link, salon }: { link: string; salon: string }) {
  const t = useT()
  const lang = useLanguage()
  const [drawn, setDrawn] = useState<Drawn>('drawing')
  const [attempt, setAttempt] = useState(0)

  // Drawn again for another language or name; the last picture's memory is given back
  useEffect(() => {
    let live = true
    let url: string | null = null
    setDrawn('drawing')
    const canvas = document.createElement('canvas')
    drawPoster(canvas, link, {
      salon,
      scan: t('share.posterScan'),
      steps: [t('share.posterStep1'), t('share.posterStep2'), t('share.posterStep3')],
      pay: t('share.posterPay'),
      link: link.replace(/^https:\/\//, ''),
    })
      .then(() => posterBlob(canvas))
      .then((blob) => {
        if (!live) return
        url = URL.createObjectURL(blob)
        setDrawn({ url, file: posterFileName(salon), blob })
      })
      .catch(() => live && setDrawn('failed'))
    return () => {
      live = false
      if (url) URL.revokeObjectURL(url)
    }
    // t changes with the language (lang), not on its own
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link, salon, lang, attempt])

  const alt = t('share.posterAlt', { salon })
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-semibold">{t('share.posterTitle')}</h2>
      <p className="text-sm text-muted">{t('share.posterHint')}</p>
      <div className="mx-auto flex aspect-[1/1.414] w-full max-w-72 items-center justify-center overflow-hidden rounded-xl bg-white">
        {typeof drawn === 'object' ? (
          <img src={drawn.url} alt={alt} className="h-full w-full" />
        ) : (
          <span className="px-4 text-center text-sm text-black/70">{drawn === 'failed' ? t('share.posterFailed') : t('share.posterDrawing')}</span>
        )}
      </div>
      {drawn === 'failed' ? (
        <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
          {t('share.posterTryAgain')}
        </Button>
      ) : (
        // One under the other: "Download poster" is three words in Tamil or Kannada, cut short side by side
        <div className="flex flex-col gap-2">
          {typeof drawn === 'object' && <SharePosterButton blob={drawn.blob} file={drawn.file} link={link} salon={salon} />}
          {typeof drawn === 'object' ? (
            <a
              href={drawn.url}
              download={drawn.file}
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-raised px-5 text-ink hover:bg-line"
            >
              {t('share.download')}
            </a>
          ) : (
            <Button variant="secondary" className="flex-1" disabled>
              {t('share.download')}
            </Button>
          )}
          <Button variant="secondary" className="flex-1" disabled={typeof drawn !== 'object'} onClick={() => window.print()}>
            {t('share.print')}
          </Button>
        </div>
      )}
      {/* What the printer gets: only this, straight under <body> (share.css) */}
      {typeof drawn === 'object' &&
        createPortal(
          <div className="share-print" data-testid="print-poster" aria-hidden>
            <img src={drawn.url} alt={alt} />
          </div>,
          document.body,
        )}
    </Card>
  )
}

/**
 * The poster itself through the phone's share sheet (WhatsApp status, a customers' group), where the phone can share
 * files (Android Chrome, iPhone Safari): no download to find in a folder first. Hidden where it can't. The message goes
 * with it as the caption, so the link comes along for anyone who can't scan from a screen.
 */
function SharePosterButton({ blob, file, link, salon }: { blob: Blob; file: string; link: string; salon: string }) {
  const t = useT()
  // Asked once per poster drawn (canShare can be slow-ish on some phones)
  const [png, able] = useMemo(() => {
    const f = new File([blob], file, { type: 'image/png' })
    try {
      return [f, typeof navigator.share === 'function' && navigator.canShare?.({ files: [f] }) === true] as const
    } catch {
      return [f, false] as const
    }
  }, [blob, file])
  if (!able) return null
  async function share() {
    try {
      await navigator.share({ files: [png], title: t('share.shareTitle', { salon }), text: t('share.message', { salon, link }) })
    } catch {
      // Closed without sending, or refused: the other buttons are still here
    }
  }
  return (
    <Button variant="secondary" onClick={() => void share()}>
      {t('share.sharePoster')}
    </Button>
  )
}
