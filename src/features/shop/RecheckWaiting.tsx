import { useShop } from '../../api/shop'
import { Card } from '../../components/ui'
import { t, useT } from '../../i18n'
import { dateOfIst } from '../../lib/ist'

/**
 * A live salon whose changes (photos, video) wait for our field team (recheckSince, the owner's only):
 * since when, any fix the team asked for, and that the salon stays live. Nothing otherwise.
 */
export function RecheckWaiting() {
  const t = useT()
  const shop = useShop()
  if (!shop.recheckSince || shop.status !== 'APPROVED') return null
  const fix = shop.statusReason
  return (
    <Card className={`flex flex-col gap-1 ${fix ? 'border-warn/60' : 'border-brand/40'}`}>
      <p className="font-semibold">
        {fix ? t('shop.recheckFixAsked') : t('shop.recheckCheckingSince', { date: dayMonth(shop.recheckSince) })}
      </p>
      {fix && <p className="text-sm break-words">{t('shop.recheckFixWhere', { fix })}</p>}
      <p className="text-sm text-muted">{t('shop.recheckStaysLive')}</p>
    </Card>
  )
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "12 Nov" in India time. */
function dayMonth(iso: string): string {
  const [, m, d] = dateOfIst(iso).split('-').map(Number)
  return t('shop.dayMonth', { day: d, month: t(`shop.monthShort${MONTHS[m - 1]}`) })
}
