import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { refreshSession } from '../../api/client'
import { messageOf } from '../../api/errors'
import { fetchMyShop, shopApi, shopKeys, useMyShop } from '../../api/shop'
import { Banner, Button, Card, Loading, Page } from '../../components/ui'
import { useT } from '../../i18n'
import { kiranaOn } from '../../lib/config'
import { formatPhone } from '../../lib/phone'
import { useSession } from '../../store/session'
import { Brand } from '../auth/Brand'
import { signOutHere } from '../profile/signOut'
import { HandoverOffers } from './HandoverOffers'
import { InviteOffers } from './InviteOffers'
import { closedNotice, forgetClosed, startNotice } from './ownership'
import { useWriteToUsHref } from '../help/HelpButton'

/**
 * Start's words and where "Register" goes. Kirana switch on: "I own a shop", then "What do you run?". Off: the salon
 * app's own words, straight to the salon's first step.
 */
export function startWords() {
  return kiranaOn()
    ? {
        welcome: 'register.welcomeShop', closedNotice: 'register.closedNoticeShop', ownTitle: 'register.ownShopTitle',
        ownBody: 'register.ownShopBody', register: 'register.registerMyShop', registerPath: '/register/kind',
        workTitle: 'register.workAtShopTitle', workBody: 'register.workAtShopBody', workButton: 'register.workAtShopButton',
      }
    : {
        welcome: 'register.welcome', closedNotice: 'register.closedNotice', ownTitle: 'register.ownSalonTitle',
        ownBody: 'register.ownSalonBody', register: 'register.registerMySalon', registerPath: '/register/ready',
        workTitle: 'register.workAtSalonTitle', workBody: 'register.workAtSalonBody', workButton: 'register.workAtSalonButton',
      }
}

/**
 * Signed in, no shop yet (404 NO_SHOP): register a shop (with the kirana switch on, a kirana or a salon: "What do
 * you run?" comes next; off, a salon), or, for someone who works in one, show the number the owner must add.
 */
export function Start() {
  const writeToUs = useWriteToUsHref()
  const t = useT()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const user = useSession((s) => s.user)!
  const shop = useMyShop()
  const [worker, setWorker] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // Just closed a shop (CloseShop): say so while this screen is open, once
  const [closed] = useState(closedNotice)
  const [note] = useState(startNotice)
  useEffect(() => forgetClosed(), [])

  if (shop.isPending) return <Loading />
  if (shop.data && shop.data.status !== 'CLOSED') return <Navigate to="/" replace />

  async function checkAgain() {
    setBusy(true)
    setNotice(null)
    try {
      const mine = await fetchMyShop()
      if (mine) {
        // Added to a shop: a fresh token carries it.
        await refreshSession()
        qc.setQueryData(shopKeys.mine, mine)
        navigate('/', { replace: true })
      } else {
        // Joining is by invitation now: look for one for this number
        const invites = await qc.fetchQuery({ queryKey: shopKeys.incomingInvites, queryFn: shopApi.incomingInvites, staleTime: 0 })
        setNotice(invites.length ? t('register.inviteAtTop') : t('register.noInviteYet'))
      }
    } catch (e) {
      setNotice(messageOf(e))
    } finally {
      setBusy(false)
    }
  }

  const w = startWords()
  return (
    <Page language>
      <Brand subtitle={t(w.welcome, { name: user.name ?? '' })} />
      {closed && (
        <Banner tone="info">
          {t(w.closedNotice, { name: closed })}
        </Banner>
      )}
      {note && <Banner tone="info">{note}</Banner>}
      {shop.isError && <Banner tone="bad">{messageOf(shop.error)}</Banner>}
      <InviteOffers />
      <HandoverOffers />
      {!worker ? (
        <div className="flex flex-col gap-3">
          <Card className="flex flex-col gap-3">
            <p className="text-lg font-semibold">{t(w.ownTitle)}</p>
            <p className="text-sm text-muted">
              {t(w.ownBody)}
            </p>
            <Button onClick={() => navigate(w.registerPath, { state: { stepsFromStart: 1 } })}>{t(w.register)}</Button>
          </Card>
          <Card className="flex flex-col gap-3">
            <p className="text-lg font-semibold">{t(w.workTitle)}</p>
            <p className="text-sm text-muted">{t(w.workBody)}</p>
            <Button variant="secondary" onClick={() => setWorker(true)}>
              {t(w.workButton)}
            </Button>
          </Card>
        </div>
      ) : (
        <Card className="flex flex-col gap-3">
          <p className="text-lg font-semibold">{t('register.askOwnerTitle')}</p>
          <p className="text-muted">
            {t('register.askOwnerBody')}
          </p>
          <p className="text-center text-2xl font-bold tracking-wide">+91 {formatPhone(user.phone)}</p>
          {notice && <Banner tone="info">{notice}</Banner>}
          <Button busy={busy} onClick={checkAgain}>
            {t('register.invitedCheckAgain')}
          </Button>
          <Button variant="ghost" onClick={() => setWorker(false)}>
            {t('common.back')}
          </Button>
        </Card>
      )}
      <Button variant="ghost" onClick={() => signOutHere(qc).then(() => navigate('/signin', { replace: true }))}>
        {t('register.signOut')}
      </Button>
      <Link to={writeToUs} className="py-2 text-center text-sm text-link underline">
        {t('register.needHelp')}
      </Link>
      <Link to="/profile/delete" className="py-2 text-center text-sm text-bad underline">
        {t('register.deleteMyAccount')}
      </Link>
    </Page>
  )
}
