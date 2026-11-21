import { useState } from 'react'
import type { ShopRole } from '../../api/types'
import { Button, Card } from '../../components/ui'
import { t, useT } from '../../i18n'

/** The tips are remembered per account and role: a barber who later runs his own salon is shown the owner's once. */
export const tipsKey = (role: ShopRole) => `tips.${role}`

export interface Tip {
  title: string
  body: string
}

/**
 * The first-time tips for a role, with the app's real button names filled in (in the reader's language), so what the
 * tip says is exactly what is on the button. Owner and helpers: a booking arriving, the customer's code and Start,
 * walk-ins (a helper's if the owner lets him), the booking's buttons, pausing and breaks. A barber: his own column, the code (he can't start without
 * it), walk-ins if the owner lets him, his own breaks (today or tomorrow, up to 4 hours).
 */
export function tipsFor(role: ShopRole): Tip[] {
  const q = (key: string) => t('guide.quoted', { text: t(key) })
  if (role === 'BARBER') {
    return [
      { title: t('guide.tipBookingTitle'), body: t('guide.tipBookingBodyBarber') },
      { title: t('guide.tipStartTitle', { start: t('day.start') }), body: t('guide.tipStartBodyBarber', { start: q('day.start') }) },
      { title: t('guide.tipWalkInTitle'), body: t('guide.tipWalkInBodyBarber', { walkIn: q('day.addWalkIn') }) },
      {
        title: t('guide.tipChangeTitleBarber'),
        body: t('guide.tipChangeBodyBarber', { doneEarly: q('day.doneEarly'), noShow: q('day.markNoShow') }),
      },
      { title: t('guide.tipBreakTitleBarber'), body: t('guide.tipBreakBodyBarber', { addBreak: q('day.addBreak') }) },
    ]
  }
  return [
    { title: t('guide.tipBookingTitle'), body: t('guide.tipBookingBody') },
    {
      title: t('guide.tipStartTitle', { start: t('day.start') }),
      body: t('guide.tipStartBody', { start: q('day.start'), anyway: q('day.startAnyway') }),
    },
    // A helper starts without walk-ins (the owner switches them on in Team): the barber's "if the owner lets you"
    {
      title: t('guide.tipWalkInTitle'),
      body: t(role === 'HELPER' ? 'guide.tipWalkInBodyHelper' : 'guide.tipWalkInBody', { walkIn: q('day.addWalkIn') }),
    },
    {
      title: t('guide.tipChangeTitle'),
      body: t('guide.tipChangeBody', { doneEarly: q('day.doneEarly'), noShow: q('day.markNoShow'), giveTo: q('day.giveToAnother') }),
    },
    { title: t('guide.tipBusyTitle'), body: t('guide.tipBusyBody', { pause: q('day.pauseLink'), addBreak: q('day.addBreak') }) },
  ]
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
          {/* Not a heading: the board's own heading (the day) stays the only one at the top */}
          <p className="font-semibold">{tip.title}</p>
          <p className="text-sm">{tip.body}</p>
          {last && <p className="text-xs text-muted">{t('guide.tipsAgain')}</p>}
        </div>
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
