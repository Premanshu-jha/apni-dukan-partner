import { useShop } from '../../api/shop'
import { Card } from '../../components/ui'
import { dateOfIst } from '../../lib/ist'

/**
 * A live salon whose changes (photos, video, GSTIN, Udyam) wait for our field team (recheckSince, the owner's only):
 * since when, any fix the team asked for, and that the salon stays live. Nothing otherwise.
 */
export function RecheckWaiting() {
  const shop = useShop()
  if (!shop.recheckSince || shop.status !== 'APPROVED') return null
  const fix = shop.statusReason
  return (
    <Card className={`flex flex-col gap-1 ${fix ? 'border-warn/60' : 'border-brand/40'}`}>
      <p className="font-semibold">
        {fix ? 'Our field team asked you to fix something' : `Our field team is checking your changes since ${dayMonth(shop.recheckSince)}`}
      </p>
      {fix && <p className="text-sm break-words">“{fix}” Fix it in the Salon tab → Salon details or Photos and video.</p>}
      <p className="text-sm text-muted">Your salon stays live and customers can book as usual.</p>
    </Card>
  )
}

/** "12 Nov" in India time. */
function dayMonth(iso: string): string {
  const [, m, d] = dateOfIst(iso).split('-').map(Number)
  return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]}`
}
