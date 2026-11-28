import { useState } from 'react'
import { Link } from 'react-router'
import type { ShopRole } from '../../api/types'
import { Button, Card } from '../../components/ui'
import { t, useT } from '../../i18n'
import { AlertsLine } from '../day/DayGlance'

/** The tips are remembered per account and role: a barber who later runs his own salon is shown the owner's once. */
export const tipsKey = (role: ShopRole) => `tips.${role}`

/** A tip's small picture (our own drawings) and, for some, its one next step right on the card. */
export type TipPic = 'live' | 'bell' | 'door' | 'code' | 'change' | 'plan'

export interface Tip {
  title: string
  body: string
  pic?: TipPic
  /** share: "Share my salon" (owner and helpers); alerts: whether bookings ring this phone, with Turn on */
  action?: 'share' | 'alerts'
}

/**
 * "How your day works", the first time someone opens Today in a live salon (and again from Help): what to expect and
 * what to do, one small card at a time, with the app's real button names filled in (in the reader's language), so
 * what a tip says is exactly what is on the button. Owner and helpers: customers can now book (the first bookings can
 * take a few days: share the salon's link, one tap); how a booking reaches them (with booking alerts on or off, Turn
 * on right there; and the 8 am and 8 pm messages); a customer at the door without a booking (Walk-in: a barber free
 * now, or a time kept for later); the customer's code and Start; the booking's buttons; pausing and breaks. A barber:
 * the same about his own column and what the owner lets him do.
 */
export function tipsFor(role: ShopRole): Tip[] {
  const q = (key: string) => t('guide.quoted', { text: t(key) })
  if (role === 'BARBER') {
    return [
      { title: t('guide.tipLiveTitle'), body: t('guide.tipLiveBodyBarber'), pic: 'live' },
      { title: t('guide.tipBookingTitle'), body: t('guide.tipBookingBodyBarber'), pic: 'bell', action: 'alerts' },
      { title: t('guide.tipStartTitle', { start: t('day.start') }), body: t('guide.tipStartBodyBarber', { start: q('day.start') }), pic: 'code' },
      { title: t('guide.tipWalkInTitle'), body: t('guide.tipWalkInBodyBarber', { walkIn: q('day.addWalkIn') }), pic: 'door' },
      {
        title: t('guide.tipChangeTitleBarber'),
        body: t('guide.tipChangeBodyBarber', { doneEarly: q('day.doneEarly'), noShow: q('day.markNoShow') }),
        pic: 'change',
      },
      { title: t('guide.tipBreakTitleBarber'), body: t('guide.tipBreakBodyBarber', { addBreak: q('day.addBreak') }), pic: 'plan' },
    ]
  }
  return [
    { title: t('guide.tipLiveTitle'), body: t('guide.tipLiveBody'), pic: 'live', action: 'share' },
    { title: t('guide.tipBookingTitle'), body: t('guide.tipBookingBody'), pic: 'bell', action: 'alerts' },
    // A helper starts without walk-ins (the owner switches them on in Team): the barber's "if the owner lets you"
    {
      title: t('guide.tipWalkInTitle'),
      body: t(role === 'HELPER' ? 'guide.tipWalkInBodyHelper' : 'guide.tipWalkInBody', { walkIn: q('day.addWalkIn'), free: q('day.freeNow') }),
      pic: 'door',
    },
    {
      title: t('guide.tipStartTitle', { start: t('day.start') }),
      body: t('guide.tipStartBody', { start: q('day.start'), anyway: q('day.startAnyway') }),
      pic: 'code',
    },
    {
      title: t('guide.tipChangeTitle'),
      body: t('guide.tipChangeBody', { doneEarly: q('day.doneEarly'), noShow: q('day.markNoShow'), giveTo: q('day.giveToAnother') }),
      pic: 'change',
    },
    { title: t('guide.tipBusyTitle'), body: t('guide.tipBusyBody', { pause: q('day.pauseLink'), addBreak: q('day.addBreak') }), pic: 'plan' },
  ]
}

/** The tips' small pictures, in the link colour (the theme's: light and dark alike). */
function TipPicture({ pic }: { pic: TipPic }) {
  const common = { viewBox: '0 0 48 48', 'aria-hidden': true, focusable: false, className: 'h-12 w-12 shrink-0 text-link', fill: 'none', stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
  switch (pic) {
    case 'live': // a phone with a map pin: customers near you find you
      return (
        <svg {...common}>
          <rect x="13" y="4" width="22" height="40" rx="4" />
          <path d="M24 30s7-7 7-12a7 7 0 1 0-14 0c0 5 7 12 7 12z" />
          <circle cx="24" cy="18" r="2.5" />
        </svg>
      )
    case 'bell': // a bell ringing: a booking arrives
      return (
        <svg {...common}>
          <path d="M12 32V22a12 12 0 1 1 24 0v10l4 4H8z" />
          <path d="M20 40a4 4 0 0 0 8 0" />
          <path d="M6 14c1-3 3-6 6-8M42 14c-1-3-3-6-6-8" />
        </svg>
      )
    case 'door': // a person at an open door: someone came without booking
      return (
        <svg {...common}>
          <path d="M6 44V6h20v38" />
          <path d="M26 6l8 4v30l-8 4" />
          <circle cx="40" cy="20" r="3" />
          <path d="M40 24v10M36 30h8M40 34l-3 8M40 34l3 8" />
        </svg>
      )
    case 'code': // the 4-digit code on the customer's phone
      return (
        <svg {...common}>
          <rect x="13" y="4" width="22" height="40" rx="4" />
          <path d="M18 22h2M23 22h2M28 22h2M18 28h12" />
        </svg>
      )
    case 'change': // two arrows: move, done early, another barber
      return (
        <svg {...common}>
          <path d="M8 16h28l-6-6M40 32H12l6 6" />
        </svg>
      )
    case 'plan': // a calendar: plan the day, breaks, pause
      return (
        <svg {...common}>
          <rect x="6" y="10" width="36" height="32" rx="4" />
          <path d="M6 20h36M16 6v8M32 6v8M14 28h6M14 34h6M28 28h6" />
        </svg>
      )
  }
}

/**
 * The tips on Today: one small card at a time in the page (never over the board, so nothing is covered), with
 * "Next", "Skip tips" and dots for how far along. Finishing or skipping calls onClose, which remembers it.
 */
export function Tips({ role, onClose }: { role: ShopRole; onClose: () => void }) {
  const t = useT()
  const tips = tipsFor(role)
  const [at, setAt] = useState(0)
  const tip = tips[Math.min(at, tips.length - 1)]
  const last = at >= tips.length - 1
  return (
    <Card className="flex flex-col gap-3 border-brand/40">
      <section aria-label={t('guide.tipsLabel')} className="flex flex-col gap-3">
        {/* Read out when it changes: Next keeps the focus, the new tip is announced */}
        <div aria-live="polite" className="flex flex-col gap-1">
          <p className="text-xs text-muted">{t('guide.tipCount', { n: at + 1, total: tips.length })}</p>
          <div className="flex items-start gap-3">
            {tip.pic && <TipPicture pic={tip.pic} />}
            <div className="flex min-w-0 flex-col gap-1">
              {/* Not a heading: the board's own heading (the day) stays the only one at the top */}
              <p className="font-semibold">{tip.title}</p>
              <p className="text-sm">{tip.body}</p>
            </div>
          </div>
          {last && <p className="text-xs text-muted">{t('guide.tipsAgain')}</p>}
        </div>
        {/* The tip's one next step, right here */}
        {tip.action === 'share' && (
          <Link to="/salon/share" state={{ from: '/salon/day' }} className="inline-flex min-h-11 items-center font-medium text-link underline">
            {t('guide.tipLiveShare')}
          </Link>
        )}
        {tip.action === 'alerts' && <AlertsLine />}
        <div className="flex items-center justify-between gap-2">
          <span className="flex gap-1.5" aria-hidden data-testid="tip-dots">
            {tips.map((_, i) => (
              <span key={i} className={`h-2 w-2 rounded-full ${i === at ? 'bg-brand' : 'bg-line'}`} />
            ))}
          </span>
          <span className="flex gap-2">
            {!last && (
              <Button variant="ghost" className="min-h-11" onClick={onClose}>
                {t('guide.skipTips')}
              </Button>
            )}
            <Button
              className="min-h-11"
              onClick={() => {
                if (last) onClose()
                else setAt(at + 1)
              }}
            >
              {last ? t('guide.tipsDone') : t('guide.next')}
            </Button>
          </span>
        </div>
      </section>
    </Card>
  )
}
