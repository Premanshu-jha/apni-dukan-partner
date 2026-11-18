import { useQueryClient } from '@tanstack/react-query'
import { Suspense, lazy, useContext, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { fieldError, isApiError, messageOf } from '../../api/errors'
import { kiranaApi, kiranaKeys, useKiranaSettings, useOnline, type FssaiStatus } from '../../api/kirana'
import { ShopContext, shopApi, shopKeys, useShop } from '../../api/shop'
import type { Shop, ShopType } from '../../api/types'
import { MapBoundary } from '../../components/MapBoundary'
import { Banner, Button, Card, ErrorState, Field, Loading, Page, Sheet } from '../../components/ui'
import { cleanUpiId, upiIdLooksRight } from '../../lib/kirana'
import { loadRegisterKind, saveRegisterKind } from '../../lib/registerDraft'
import { readyForVisit } from '../../lib/salonVideo'
import { useSession } from '../../store/session'
import { licencesGap, licencesReady } from './KiranaLicences'
import { DraftExits, Line, SentBack, Steps, Thumb } from './Register'

const PinMap = lazy(() => import('../../components/PinMap').then((m) => ({ default: m.PinMap })))

const KINDS: { kind: ShopType; title: string; body: string }[] = [
  {
    kind: 'KIRANA',
    title: 'Kirana / general store',
    body: 'Grocery, provisions, daily needs. Bill at your counter, keep your stock and khata, and get orders from nearby customers.',
  },
  {
    kind: 'SALON',
    title: 'Salon / barber shop',
    body: 'Haircuts, grooming, beauty. Customers nearby book a time with you or your barbers.',
  },
]

/**
 * "What do you run?": the first question of registration, and where a kind picked by mistake is changed (from the
 * "Change" link on every step) any time before Submit. Before the shop is saved the answer is kept on this phone; after,
 * changing it asks first, saying what goes, then PUT /shops/me/type.
 */
export function RegisterKind() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const shop = useContext(ShopContext)
  const userId = useSession((s) => s.user?.id)
  const current = shop?.type ?? loadRegisterKind(userId)
  const [asking, setAsking] = useState<ShopType | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function pick(kind: ShopType) {
    setError(null)
    if (!shop) {
      if (userId) saveRegisterKind(userId, kind)
      navigate('/register')
      return
    }
    if (kind === shop.type) {
      navigate('/')
      return
    }
    setAsking(kind)
  }

  async function change(kind: ShopType) {
    if (!shop) return
    setBusy(true)
    setError(null)
    try {
      const latest = qc.getQueryData<Shop>(shopKeys.mine) ?? shop
      qc.setQueryData(shopKeys.mine, await shopApi.changeType(latest.version, kind))
      // A kirana's screens (its UPI ID) and a salon's read different things: nothing old is shown for the new kind
      void qc.invalidateQueries({ queryKey: kiranaKeys.all })
      setAsking(null)
      // Home sends the owner on to the first step the new kind still needs
      navigate('/', { replace: true })
    } catch (e) {
      setAsking(null)
      setError(messageOf(e))
      if (isApiError(e, 'SHOP_CHANGED') || isApiError(e, 'WRONG_STATUS')) await qc.invalidateQueries({ queryKey: shopKeys.mine })
    } finally {
      setBusy(false)
    }
  }

  // A Shops and Establishments certificate is a kirana's only: it comes off a shop becoming a salon
  const losingCertificate = asking === 'SALON' && shop?.registrationDocType === 'SHOPS_ESTABLISHMENT'
  const keepsLicence = Boolean(shop?.registrationDocFileId) && !losingCertificate
  return (
    <Page back={shop ? '/' : '/start'} title="What do you run?">
      <p className="text-muted">
        {shop
          ? `You're registering ${shop.name}. Picked the wrong kind? Change it here; you can do this until you submit it.`
          : 'Choose one. You can change it later while you register, until you submit it.'}
      </p>
      {shop?.statusReason && <SentBack reason={shop.statusReason} />}
      <div className="flex flex-col gap-3" role="group" aria-label="What do you run?">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            onClick={() => pick(k.kind)}
            aria-pressed={current === k.kind}
            className={`flex flex-col gap-1 rounded-2xl border p-4 text-left hover:bg-raised ${current === k.kind ? 'border-brand bg-brand/10' : 'border-line bg-surface'}`}
          >
            <span className="text-lg font-semibold">
              {k.title}
              {current === k.kind && <span className="ml-2 text-sm font-normal text-link">(chosen)</span>}
            </span>
            <span className="text-sm text-muted">{k.body}</span>
          </button>
        ))}
      </div>
      {error && <Banner tone="bad">{error}</Banner>}
      <Sheet open={asking !== null} title={asking === 'KIRANA' ? 'Change to a kirana?' : 'Change to a salon?'} onClose={() => !busy && setAsking(null)}>
        <div className="flex flex-col gap-3">
          <p>Your shop's name, address, location pin, photos and video stay.</p>
          {keepsLicence && <p className="text-sm text-muted">Your trade licence stays and is checked again for a {asking === 'KIRANA' ? 'kirana' : 'salon'}.</p>}
          {losingCertificate && <p className="text-warn">We'll remove your Shops and Establishments certificate: only a kirana adds one.</p>}
          {asking === 'KIRANA' ? (
            <p className="text-sm text-muted">Next: whether you sell food (then your FSSAI licence), and the UPI ID your customers pay to at the counter.</p>
          ) : (
            <p className="text-sm text-muted">
              Next you'll add the salon's services and opening hours. A UPI ID or food answer you gave stays saved, unused by a salon, in
              case you change back.
            </p>
          )}
          <Button variant="secondary" disabled={busy} onClick={() => setAsking(null)}>
            Keep it as it is
          </Button>
          <Button busy={busy} onClick={() => asking && change(asking)}>
            {asking === 'KIRANA' ? 'Yes, it is a kirana' : 'Yes, it is a salon'}
          </Button>
        </div>
      </Sheet>
    </Page>
  )
}

/**
 * The shop's UPI ID (registration's step 3 for a kirana, and its settings later): walk-in customers pay to it by
 * scanning the QR the counter shows. Owner only; the backend keeps it without spaces, in lower case.
 */
export function UpiIdForm({ onSaved, saveLabel }: { onSaved: (upiId: string) => void; saveLabel: string }) {
  const qc = useQueryClient()
  const settings = useKiranaSettings()
  const [typed, setTyped] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  if (settings.isPending) return <Loading />
  if (settings.isError && !settings.data) return <ErrorState message={messageOf(settings.error)} onRetry={() => settings.refetch()} />
  const saved = settings.data?.upiId ?? ''
  const value = typed ?? saved
  const cleaned = cleanUpiId(value)
  const problem = !cleaned ? 'Enter the UPI ID' : !upiIdLooksRight(cleaned) ? 'It looks like name@bank, e.g. sharmastore@okhdfcbank' : null

  async function save() {
    setTouched(true)
    setError(null)
    if (problem) return
    if (cleaned === saved) {
      onSaved(saved)
      return
    }
    setBusy(true)
    try {
      const next = await kiranaApi.setUpiId(cleaned)
      qc.setQueryData(kiranaKeys.settings, next)
      setTyped(null)
      onSaved(next.upiId ?? cleaned)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  const shown = (touched && problem) || fieldError(error, 'upiId')
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <Field
          id="upi-id"
          label="Your shop's UPI ID"
          hint="The one your customers pay to: in your UPI app (PhonePe, Google Pay, Paytm, BHIM) under your profile or QR."
          value={value}
          onChange={(e) => {
            setTyped(e.target.value)
            setError(null)
          }}
          onBlur={() => setTouched(true)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="email"
          maxLength={120}
          placeholder="sharmastore@okhdfcbank"
          error={shown || undefined}
        />
        {cleaned && !problem && cleaned !== value.trim() && <p className="text-sm text-muted">Saved as {cleaned}</p>}
        <p className="text-sm text-muted">
          At the counter the app shows a QR with the bill's amount; the customer scans it and pays straight to this ID.
          Money never passes through Clozest. Our field team checks it when they visit.
        </p>
      </Card>
      {error !== null && !fieldError(error, 'upiId') && !isApiError(error, 'EDIT_LOCKED') && <Banner tone="bad">{messageOf(error)}</Banner>}
      <Button busy={busy} onClick={save}>
        {saveLabel}
      </Button>
    </div>
  )
}

/** Step 3 of a kirana's registration: its UPI ID. */
export function RegisterUpi() {
  const navigate = useNavigate()
  const shop = useShop()
  const location = useLocation()
  const fromReview = new URLSearchParams(location.search).get('from') === 'review'
  return (
    <Page back={fromReview ? '/register/review' : '/register/licences'} title="UPI ID">
      <Steps at={4} />
      {shop.statusReason && <SentBack reason={shop.statusReason} />}
      <UpiIdForm saveLabel={fromReview ? 'Save and go back to the review' : 'Save and continue'} onSaved={() => navigate('/register/review')} />
    </Page>
  )
}

/** A kirana's last step: check everything and ask for the field team's visit. */
export function KiranaReview() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const shop = useShop()
  const settings = useKiranaSettings()
  const online = useOnline()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const sending = useRef(false)
  const photos = Boolean(shop.ownerPhotoFileId && shop.shopPhotoFileId)
  const video = Boolean(shop.shopVideoFileId)
  const upiId = settings.data?.upiId ?? null
  const papers = licencesReady(settings.data, online.data?.fssai)
  const ready = readyForVisit(shop) && Boolean(upiId) && papers
  const sellsFood = settings.data?.sellsFood ?? null
  const fssai = online.data?.fssai

  async function submit() {
    if (sending.current) return
    sending.current = true
    setBusy(true)
    setError(null)
    try {
      qc.setQueryData(shopKeys.mine, await shopApi.submit(shop.version))
      navigate('/', { replace: true })
    } catch (e) {
      setAsking(false)
      setError(messageOf(e))
      if (isApiError(e, 'SHOP_CHANGED') || isApiError(e, 'PHOTOS_REQUIRED') || isApiError(e, 'WRONG_STATUS') || isApiError(e, 'REGISTRATION_INCOMPLETE')) {
        await Promise.all([
          qc.invalidateQueries({ queryKey: shopKeys.mine }),
          qc.invalidateQueries({ queryKey: kiranaKeys.settings }),
          qc.invalidateQueries({ queryKey: kiranaKeys.online }),
        ])
      }
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  const address = `${shop.addressLine}, ${shop.area}, ${shop.city} ${shop.pincode}`
  return (
    <Page back="/register/upi" title="Check and submit">
      <Steps at={5} />
      {shop.statusReason && <SentBack reason={shop.statusReason} />}
      <Card className="flex flex-col gap-3">
        <Line label="Shop" value={shop.name} />
        <Line label="Owner" value={shop.ownerName} />
        <Line label="Address" value={address} />
        <Line label="GSTIN" value={shop.gstin ?? 'Not added (optional)'} />
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted">Pin on the map (customers find you here)</p>
          <MapBoundary>
            <Suspense fallback={<Loading label="Loading the map…" />}>
              <PinMap lat={shop.latitude} lng={shop.longitude} />
            </Suspense>
          </MapBoundary>
        </div>
        <Link to="/register?from=review" className="text-sm text-link underline">
          Edit details or move the pin
        </Link>
      </Card>
      <Card className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span>Photos: {photos ? 'both added' : 'missing'}</span>
          <Link to="/register/photos?from=review" className="text-sm text-link underline">
            {photos ? 'Change' : 'Add'}
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Thumb fileId={shop.ownerPhotoFileId} label="Your photo" />
          <Thumb fileId={shop.shopPhotoFileId} label="Shop front" />
        </div>
      </Card>
      <Card className="flex items-center justify-between">
        <span>Shop video: {video ? 'added' : 'missing'}</span>
        <Link to="/register/photos?from=review" className="text-sm text-link underline">
          {video ? 'Change' : 'Add'}
        </Link>
      </Card>
      <Card className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">Licences</span>
          <Link to="/register/licences?from=review" className="shrink-0 text-sm text-link underline">
            {papers ? 'Change' : 'Add'}
          </Link>
        </div>
        <p className="text-sm">
          Sells food: {settings.isPending ? '…' : sellsFood === null ? 'not answered' : sellsFood ? 'yes' : 'no'}
        </p>
        {sellsFood && (
          <p className="text-sm break-words">
            FSSAI: {!fssai || fssai.status === 'NONE' ? 'missing' : `${fssai.number ?? ''} · ${fssaiWords(fssai.status)}`}
          </p>
        )}
        <p className="text-sm text-muted">
          Shop licence: {shop.registrationDocFileId ? (shop.registrationDocType === 'SHOPS_ESTABLISHMENT' ? 'Shops & Establishments' : 'trade licence') + ` · ${licenceWords(shop)}` : 'not added (optional)'}
        </p>
      </Card>
      <Card className="flex items-center justify-between gap-2">
        <span className="min-w-0 break-words">
          UPI ID: {settings.isPending ? '…' : upiId ?? 'missing'}
        </span>
        <Link to="/register/upi?from=review" className="shrink-0 text-sm text-link underline">
          {upiId ? 'Change' : 'Add'}
        </Link>
      </Card>
      {settings.isError && !settings.data && (
        <Banner tone="bad">
          Couldn't read your UPI ID. {messageOf(settings.error)}{' '}
          <button type="button" className="underline" onClick={() => void settings.refetch()}>
            Try again
          </button>
        </Banner>
      )}
      <p className="text-sm text-muted">
        After you submit, our field team calls and visits to check the shop. Meanwhile you can add your products and
        start billing at the counter.
      </p>
      {error && <Banner tone="bad">{error}</Banner>}
      <Button disabled={!ready} onClick={() => setAsking(true)}>
        Submit for the visit
      </Button>
      {!ready && !settings.isPending && (
        <p className="text-center text-sm text-muted">
          {!photos ? 'Both photos are needed.' : !video ? 'The shop video is needed.' : !papers ? licencesGap(settings.data, fssai) : 'Your UPI ID is needed.'}
        </p>
      )}
      <Sheet open={asking} title="Submit for the field visit?" onClose={() => !busy && setAsking(false)}>
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-1 rounded-xl border border-line bg-raised px-4 py-3 text-sm">
            <li className="font-semibold">{shop.name}</li>
            <li className="text-muted">{address}</li>
            <li className="break-words">UPI ID: {upiId}</li>
            <li>{sellsFood ? `Sells food · FSSAI ${fssai?.number ?? ''}` : 'Sells no food'}</li>
          </ul>
          <p className="text-muted">
            After you submit, our field team calls you to fix a time and visits {shop.name}. Nearby customers can order
            from you once it's approved.
          </p>
          <p className="text-sm text-muted">Something to fix first? Tap Not yet. You can't change the kind of shop after submitting.</p>
          <Button variant="secondary" disabled={busy} onClick={() => setAsking(false)}>
            Not yet
          </Button>
          <Button busy={busy} onClick={submit}>
            Yes, submit
          </Button>
        </div>
      </Sheet>
      <DraftExits name={shop.name} />
    </Page>
  )
}

function fssaiWords(status: FssaiStatus): string {
  return status === 'CHECKING' ? 'being checked' : status === 'VERIFIED' ? 'verified' : status === 'REJECTED' ? 'not accepted: fix it' : 'missing'
}

function licenceWords(shop: Shop): string {
  return shop.licenceCheck === 'PASSED' ? 'checked' : shop.licenceCheck === 'FAILED' ? 'not accepted' : 'being checked'
}
