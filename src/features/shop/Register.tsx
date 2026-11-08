import { useQueryClient } from '@tanstack/react-query'
import { lazy, Suspense, useContext, useEffect, useRef, useState } from 'react'
import { Link, Navigate, Outlet, useNavigate } from 'react-router'
import { fieldError, isApiError, messageOf } from '../../api/errors'
import { fileApi, ShopContext, shopApi, shopKeys, useMyShop, useShop } from '../../api/shop'
import type { GeocodePrecision, Shop, ShopDetailsIn } from '../../api/types'
import { LocationGuide } from '../../components/LocationGuide'
import { PhotoPicker } from '../../components/PhotoPicker'
import { Banner, Button, Card, ErrorState, Field, Loading, Page } from '../../components/ui'
import {
  insideIndia,
  locateOnce,
  metresBetween,
  permissionState,
  ROUGH_METRES,
  round6,
  type Fix,
  type LocateError,
} from '../../lib/locate'
import { forgetRegisterDraft, loadRegisterDraft, saveRegisterDraft } from '../../lib/registerDraft'
import { useSession } from '../../store/session'
import {
  ADDRESS_FIELDS,
  addressSearchOff,
  canSearchAddress,
  FILLED_TEXT,
  fillEmpty,
  markAddressSearchOff,
  precisionHint,
  searchFailure,
  zoomFor,
} from './addressPin'
import { signOutHere } from '../profile/signOut'

/** The map library is big and only registration needs it: loaded when this screen shows the map. */
const PinMap = lazy(() => import('../../components/PinMap').then((m) => ({ default: m.PinMap })))

/**
 * Registration screens. Step 1 works with no shop yet (it creates one); steps 2 and 3 need the owner's draft.
 * Anyone else (a shop already submitted, a helper) goes back to the start.
 */
export function RegisterLayout({ needShop }: { needShop: boolean }) {
  const shop = useMyShop()
  if (shop.isPending) return <Loading />
  if (shop.isError && shop.data === undefined) {
    return (
      <Page back="/" title="Register your salon">
        <ErrorState message={messageOf(shop.error)} onRetry={() => shop.refetch()} />
      </Page>
    )
  }
  const mine = shop.data ?? null
  if (mine && (mine.myRole !== 'OWNER' || mine.status !== 'DRAFT' || mine.type !== 'SALON')) return <Navigate to="/" replace />
  if (needShop && !mine) return <Navigate to="/register" replace />
  return (
    <ShopContext.Provider value={mine}>
      <Outlet />
    </ShopContext.Provider>
  )
}

function Steps({ at }: { at: 1 | 2 | 3 }) {
  const names = ['Details', 'Photos', 'Submit']
  return (
    <ol className="flex gap-2" aria-label="Registration steps">
      {names.map((n, i) => (
        <li
          key={n}
          aria-current={i + 1 === at ? 'step' : undefined}
          className={`flex-1 rounded-full py-1 text-center text-xs font-semibold ${i + 1 <= at ? 'bg-brand text-brand-ink' : 'bg-raised text-muted'}`}
        >
          {i + 1}. {n}
        </li>
      ))}
    </ol>
  )
}

type Form = Omit<ShopDetailsIn, 'latitude' | 'longitude' | 'gstin' | 'udyamNumber'> & {
  gstin: string
  udyamNumber: string
}

const empty: Form = { name: '', ownerName: '', addressLine: '', area: '', city: '', pincode: '', gstin: '', udyamNumber: '' }

function formOf(shop: Shop): Form {
  return {
    name: shop.name,
    ownerName: shop.ownerName,
    addressLine: shop.addressLine,
    area: shop.area,
    city: shop.city,
    pincode: shop.pincode,
    gstin: shop.gstin ?? '',
    udyamNumber: shop.udyamNumber ?? '',
  }
}

interface Pin {
  lat: number
  lng: number
  /** Where GPS put it, to tell how far it was dragged. */
  gps: Fix | null
  /** The map's zoom when it was placed. */
  zoom: number
  /** Counts placements, so the map re-centres even on the same point. */
  placement: number
}

/** The same limits as the backend's CreateShop, so most mistakes show before sending. */
export function checkDetails(f: Form): Partial<Record<keyof Form, string>> {
  const e: Partial<Record<keyof Form, string>> = {}
  const len = (v: string, min: number, max: number) => v.trim().length >= min && v.trim().length <= max
  if (!len(f.name, 2, 100)) e.name = 'Enter the salon name (2 to 100 letters)'
  if (!len(f.ownerName, 2, 100)) e.ownerName = 'Enter the owner’s name (2 to 100 letters)'
  if (!len(f.addressLine, 5, 200)) e.addressLine = 'Enter the shop number, building and street'
  if (!len(f.area, 2, 100)) e.area = 'Enter the area or locality'
  if (!len(f.city, 2, 60)) e.city = 'Enter the city'
  if (!/^[1-9]\d{5}$/.test(f.pincode.trim())) e.pincode = 'Enter the 6-digit pincode'
  if (f.gstin.trim() && f.gstin.trim().length !== 15) e.gstin = 'A GSTIN has 15 letters and digits'
  if (f.udyamNumber.trim().length > 25) e.udyamNumber = 'Too long for an Udyam number'
  return e
}

/** Step 1: the salon's details and its location pin. */
export function RegisterDetails() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const shop = useContext(ShopContext)
  const userId = useSession((s) => s.user?.id)
  const [form, setForm] = useState<Form>(() => (shop ? formOf(shop) : { ...empty, ...loadRegisterDraft<Form>(userId) }))
  const [pin, setPin] = useState<Pin | null>(() =>
    shop ? { lat: shop.latitude, lng: shop.longitude, gps: null, zoom: 18, placement: 0 } : null,
  )
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState<LocateError | null>(null)
  const [blocked, setBlocked] = useState(false)
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchHidden, setSearchHidden] = useState(addressSearchOff)
  /** How exact the pin from the address is; null once GPS, a drag or a later edit took over. */
  const [found, setFound] = useState<GeocodePrecision | null>(null)
  /** The address was edited after it placed the pin. */
  const [addressChanged, setAddressChanged] = useState(false)
  /** "Find my salon on the map" tapped before the address was filled in. */
  const [needFields, setNeedFields] = useState(false)
  /** After the search was turned off, focus goes to "Use my location". */
  const [focusGps, setFocusGps] = useState(false)
  /**
   * The last thing the owner did to the pin (a button tapped or the pin dragged). An answer to an older tap (a slow
   * GPS fix, a slow search) is dropped, so the last one wins and a drag is never undone.
   */
  const latest = useRef(0)
  /** The form as last drawn, to tell whether the address from the GPS point filled anything. */
  const formNow = useRef(form)
  useEffect(() => {
    formNow.current = form
  }, [form])
  /** The address fields were filled from the GPS point. */
  const [filled, setFilled] = useState(false)

  // Nothing is on the backend before the first save: keep the typing on this phone meanwhile.
  useEffect(() => {
    if (!shop && userId) saveRegisterDraft(userId, form)
  }, [form, shop, userId])

  useEffect(() => {
    void permissionState().then((s) => setBlocked(s === 'denied'))
  }, [locError])

  const problems = checkDetails(form)
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setForm((f) => ({ ...f, [k]: value }))
    if ((ADDRESS_FIELDS as readonly string[]).includes(k)) {
      setNeedFields(false)
      setSearchError(null)
      if (found) {
        // The pin came from the address as it was; the owner keeps it but should search again or drag it
        setFound(null)
        setAddressChanged(true)
      }
    }
  }

  useEffect(() => {
    if (!focusGps) return
    // "Use my location", or the card's heading when the guide to turn location on shows instead
    ;(document.getElementById('use-my-location') ?? document.getElementById('salon-location'))?.focus()
    setFocusGps(false)
  }, [focusGps])

  function place(lat: number, lng: number, gps: Fix | null, zoom: number) {
    setPin((p) => ({ lat, lng, gps, zoom, placement: (p?.placement ?? 0) + 1 }))
  }

  /** The owner dragged the pin (or tapped the map): it stays there, whatever answer comes in later. */
  function moveByHand(lat: number, lng: number) {
    latest.current++
    setPin((p) => (p ? { ...p, lat, lng } : p))
    setFound(null)
    setAddressChanged(false)
  }
  const show = (k: keyof Form) => (touched ? problems[k] : undefined) ?? fieldError(error, k)

  async function locate() {
    const tap = ++latest.current
    setLocating(true)
    setLocError(null)
    try {
      const fix = await locateOnce()
      if (tap !== latest.current) return
      place(fix.lat, fix.lng, fix, 18)
      setFound(null)
      setSearchError(null)
      setAddressChanged(false)
      setFilled(false)
      // Only worth asking (it uses the same Google budget) while an address field is still empty
      if (ADDRESS_FIELDS.some((k) => !formNow.current[k].trim())) void fillFromPoint(fix, tap)
    } catch (e) {
      if (tap === latest.current) setLocError(e as LocateError)
    } finally {
      setLocating(false)
    }
  }

  /**
   * The address at the GPS point fills the empty address fields. Quiet when it fails: the pin is what matters, and
   * the owner can still type. Fields the owner filled meanwhile are kept, and the answer is dropped if the owner took
   * the location again, searched the address or moved the pin since (`tap`, as for the pin).
   */
  async function fillFromPoint(fix: Fix, tap: number) {
    if (addressSearchOff()) return
    try {
      const at = await shopApi.reverseGeocode(round6(fix.lat), round6(fix.lng))
      if (tap !== latest.current) return
      if (fillEmpty(formNow.current, at) === formNow.current) return
      setForm((f) => fillEmpty(f, at))
      setFilled(true)
    } catch (e) {
      if (isApiError(e, 'GEOCODING_OFF')) {
        markAddressSearchOff()
        setSearchHidden(true)
      }
    }
  }

  /** "Find my salon on the map": the typed address becomes the pin, to be dragged onto the door. */
  async function searchAddress() {
    if (!canSearchAddress(form)) {
      setNeedFields(true)
      return
    }
    const tap = ++latest.current
    setSearching(true)
    setSearchError(null)
    setNeedFields(false)
    setFilled(false)
    const sent = {
      addressLine: form.addressLine.trim(),
      area: form.area.trim(),
      city: form.city.trim(),
      pincode: form.pincode.trim(),
    }
    try {
      const at = await shopApi.geocode(sent)
      if (tap !== latest.current) return
      place(at.latitude, at.longitude, null, zoomFor(at.precision))
      // Edited while the search ran: the pin is for the address as it was
      const edited = ADDRESS_FIELDS.some((k) => formNow.current[k].trim() !== sent[k])
      setFound(edited ? null : at.precision)
      setAddressChanged(edited)
      setLocError(null)
    } catch (e) {
      if (tap !== latest.current) return
      const failure = searchFailure(e)
      // The old "on your door" hint no longer fits; the pin itself stays for the owner to drag
      setFound(null)
      setAddressChanged(false)
      if (failure.hide) {
        setSearchHidden(true)
        setFocusGps(true)
      } else setSearchError(failure.text)
    } finally {
      setSearching(false)
    }
  }

  async function save() {
    setTouched(true)
    setError(null)
    if (Object.keys(problems).length || !pin || !insideIndia(pin.lat, pin.lng)) return
    const details: ShopDetailsIn = {
      name: form.name.trim(),
      ownerName: form.ownerName.trim(),
      addressLine: form.addressLine.trim(),
      area: form.area.trim(),
      city: form.city.trim(),
      pincode: form.pincode.trim(),
      latitude: round6(pin.lat),
      longitude: round6(pin.lng),
      gstin: form.gstin.trim().toUpperCase() || null,
      udyamNumber: form.udyamNumber.trim().toUpperCase() || null,
    }
    setBusy(true)
    try {
      const saved = shop
        ? await shopApi.update(shop.version, { ...details, gstin: details.gstin ?? '', udyamNumber: details.udyamNumber ?? '' })
        : await shopApi.create(details)
      forgetRegisterDraft()
      qc.setQueryData(shopKeys.mine, saved)
      navigate('/register/photos')
    } catch (e) {
      if (isApiError(e, 'ALREADY_HAS_SHOP') || isApiError(e, 'SHOP_CHANGED')) {
        // Registered from another tab or phone, or changed meanwhile: start from what the backend has.
        await qc.invalidateQueries({ queryKey: shopKeys.mine })
      }
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  const moved = pin?.gps ? metresBetween(pin.gps, pin) : 0
  // Field errors show under their fields; the banner is for everything else.
  const generalError = error && !Object.keys(empty).some((k) => fieldError(error, k)) ? messageOf(error) : null

  return (
    // A saved draft has no screen before this one ("/" comes back here), so no back arrow then
    <Page back={shop ? undefined : '/start'} title="Register your salon">
      <Steps at={1} />
      {shop?.statusReason && <SentBack reason={shop.statusReason} />}
      <Card className="flex flex-col gap-4">
        <Field id="shop-name" label="Salon name" value={form.name} onChange={set('name')} maxLength={100} error={show('name')} />
        <Field id="owner-name" label="Owner’s name" value={form.ownerName} onChange={set('ownerName')} maxLength={100} autoComplete="name" error={show('ownerName')} />
        <Field id="address" label="Shop number, building, street" value={form.addressLine} onChange={set('addressLine')} maxLength={200} error={show('addressLine')} />
        <Field id="area" label="Area" value={form.area} onChange={set('area')} maxLength={100} error={show('area')} />
        <div className="grid grid-cols-2 gap-3">
          <Field id="city" label="City" value={form.city} onChange={set('city')} maxLength={60} error={show('city')} />
          <Field id="pincode" label="Pincode" inputMode="numeric" value={form.pincode} onChange={set('pincode')} maxLength={6} error={show('pincode')} />
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <div>
          <p id="salon-location" tabIndex={-1} className="font-semibold outline-none">
            Salon location
          </p>
          <p className="text-sm text-muted">
            {searchHidden
              ? 'Stand inside your salon and tap the button.'
              : 'Stand inside your salon and tap Use my location, or find it from the address and drag the pin onto your door.'}{' '}
            Customers nearby find you by this pin; our field team checks it on their visit.
          </p>
        </div>
        {!searchHidden && (
          <Button
            variant="secondary"
            busy={searching}
            disabled={locating}
            aria-disabled={!canSearchAddress(form) || undefined}
            className={canSearchAddress(form) ? '' : 'opacity-50'}
            onClick={searchAddress}
            aria-describedby={needFields ? 'address-search-needs' : undefined}
          >
            Find my salon on the map
          </Button>
        )}
        {/* One live region for every location message, always there, so screen readers hear each change once */}
        <div aria-live="polite" className="flex flex-col gap-2 empty:hidden">
          {needFields && (
            <p id="address-search-needs" className="text-sm text-muted">
              Fill in the address, area, city and pincode above to find it on the map.
            </p>
          )}
          {filled && <Banner tone="info" live={false}>{FILLED_TEXT}</Banner>}
          {searchError && <Banner tone="warn" live={false}>{searchError}</Banner>}
          {found && <Banner tone={found === 'EXACT' ? 'info' : 'warn'} live={false}>{precisionHint(found)}</Banner>}
          {addressChanged && (
            <Banner tone="info" live={false}>
              You changed the address — tap Find my salon on the map again or drag the pin.
            </Banner>
          )}
          {locError === 'timeout' && <Banner tone="warn" live={false}>That took too long. Turn on GPS and move near the door, then try again.</Banner>}
          {locError === 'unavailable' && <Banner tone="warn" live={false}>Your phone couldn't find its location. Check that location is on.</Banner>}
          {locError === 'unsupported' && <Banner tone="bad" live={false}>This browser can't share a location. Open the app in Chrome or Safari.</Banner>}
        </div>
        {pin && (
          <>
            <Suspense fallback={<Loading label="Loading the map…" />}>
              <PinMap lat={pin.lat} lng={pin.lng} zoom={pin.zoom} placement={pin.placement} onMove={moveByHand} />
            </Suspense>
            <p className="text-sm text-muted">
              Drag the pin to your door if it's off.
              {pin.gps && ` GPS was accurate to about ${pin.gps.accuracy} m.`}
              {moved > 0 && ` Moved ${moved} m from the GPS point.`}
            </p>
            {pin.gps && pin.gps.accuracy > ROUGH_METRES && (
              <Banner tone="warn">The phone isn't sure where it is. Go near the door or a window, then take it again.</Banner>
            )}
            {!insideIndia(pin.lat, pin.lng) && <Banner tone="bad">The pin must be in India.</Banner>}
          </>
        )}
        {locError === 'denied' || (!pin && blocked) ? (
          <LocationGuide onRetry={locate} />
        ) : (
          <Button id="use-my-location" variant={pin ? 'secondary' : 'primary'} busy={locating} disabled={searching} onClick={locate}>
            {pin?.gps ? 'Take my location again' : 'Use my location'}
          </Button>
        )}
        {touched && !pin && <p className="text-sm text-bad">Add the salon's location to continue.</p>}
      </Card>

      <Card className="flex flex-col gap-4">
        <p className="text-sm text-muted">Optional. You can add these later.</p>
        <Field id="gstin" label="GSTIN" value={form.gstin} onChange={set('gstin')} maxLength={15} autoCapitalize="characters" error={show('gstin')} />
        <Field id="udyam" label="Udyam number" value={form.udyamNumber} onChange={set('udyamNumber')} maxLength={25} autoCapitalize="characters" placeholder="UDYAM-UP-29-0012345" error={show('udyamNumber')} />
      </Card>

      {generalError && <Banner tone="bad">{generalError}</Banner>}
      <Button busy={busy} onClick={save}>
        Save and continue
      </Button>
      <Button variant="ghost" onClick={() => signOutHere(qc).then(() => navigate('/signin', { replace: true }))}>
        Sign out
      </Button>
      {shop && <DraftExits name={shop.name} />}
    </Page>
  )
}

/**
 * A registered draft's owner who isn't going ahead: hand it over or close it (after closing, Start offers deleting the
 * account). An owner can't delete their account while they own a shop.
 */
function DraftExits({ name }: { name: string }) {
  return (
    <p className="text-center text-sm text-muted">
      Not going ahead with {name}?{' '}
      <Link to="/shop/handover" className="text-link underline">
        Hand it over
      </Link>{' '}
      or{' '}
      <Link to="/shop/close" className="text-bad underline">
        close it
      </Link>
      . To delete your account, close it first.
    </p>
  )
}

/** Step 2: the owner's photo (for the field team) and the shop front (customers see it). */
export function RegisterPhotos() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const shop = useShop()

  // Both pickers can be busy at once: their saves go one after the other, each with the version the last one left.
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  function setPhoto(kind: 'OWNER_PHOTO' | 'SHOP_PHOTO', photo: Blob) {
    const upload = fileApi.upload(photo, kind === 'OWNER_PHOTO' ? 'owner.jpg' : 'shop.jpg', kind)
    upload.catch(() => undefined) // its failure is reported through run below
    // Waits for the save before it whatever happens to this upload; the upload itself runs meanwhile
    const run = queue.current
      .catch(() => undefined)
      .then(() => upload)
      .then((file) => attach(kind, file.id))
    queue.current = run
    return run
  }

  async function attach(kind: 'OWNER_PHOTO' | 'SHOP_PHOTO', fileId: string) {
    const latest = qc.getQueryData<Shop>(shopKeys.mine) ?? shop
    try {
      const saved = await shopApi.setPhotos(
        latest.version,
        kind === 'OWNER_PHOTO' ? { ownerPhotoFileId: fileId } : { shopPhotoFileId: fileId },
      )
      qc.setQueryData(shopKeys.mine, saved)
    } catch (e) {
      if (isApiError(e, 'SHOP_CHANGED')) await qc.invalidateQueries({ queryKey: shopKeys.mine })
      throw e
    }
  }

  const done = Boolean(shop.ownerPhotoFileId && shop.shopPhotoFileId)
  return (
    <Page back="/register" title="Photos">
      <Steps at={2} />
      <PhotoPicker
        label="Your photo"
        hint="A clear photo of your face. Only our field team sees it, to know who to meet."
        capture="user"
        fileId={shop.ownerPhotoFileId}
        upload={(p) => setPhoto('OWNER_PHOTO', p)}
      />
      <PhotoPicker
        label="Shop front"
        hint="From outside, with the board visible. Customers see this photo."
        capture="environment"
        fileId={shop.shopPhotoFileId}
        upload={(p) => setPhoto('SHOP_PHOTO', p)}
      />
      <Button disabled={!done} onClick={() => navigate('/register/review')}>
        Continue
      </Button>
      {!done && <p className="text-center text-sm text-muted">Both photos are needed.</p>}
    </Page>
  )
}

/** Step 3: check everything and ask for the field team's visit. */
export function RegisterReview() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const shop = useShop()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ready = Boolean(shop.ownerPhotoFileId && shop.shopPhotoFileId)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      qc.setQueryData(shopKeys.mine, await shopApi.submit(shop.version))
      navigate('/', { replace: true })
    } catch (e) {
      setError(messageOf(e))
      if (isApiError(e, 'SHOP_CHANGED') || isApiError(e, 'PHOTOS_REQUIRED') || isApiError(e, 'WRONG_STATUS')) {
        await qc.invalidateQueries({ queryKey: shopKeys.mine })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page back="/register/photos" title="Check and submit">
      <Steps at={3} />
      {shop.statusReason && <SentBack reason={shop.statusReason} />}
      <Card className="flex flex-col gap-3">
        <Line label="Salon" value={shop.name} />
        <Line label="Owner" value={shop.ownerName} />
        <Line label="Address" value={`${shop.addressLine}, ${shop.area}, ${shop.city} ${shop.pincode}`} />
        <Line label="Location" value={`${shop.latitude.toFixed(5)}, ${shop.longitude.toFixed(5)}`} />
        {shop.gstin && <Line label="GSTIN" value={shop.gstin} />}
        {shop.udyamNumber && <Line label="Udyam" value={shop.udyamNumber} />}
        <Link to="/register" className="text-sm text-link underline">
          Edit details
        </Link>
      </Card>
      <Card className="flex items-center justify-between">
        <span>Photos: {ready ? 'both added' : 'missing'}</span>
        <Link to="/register/photos" className="text-sm text-link underline">
          {ready ? 'Change' : 'Add'}
        </Link>
      </Card>
      <p className="text-sm text-muted">
        After you submit, our field team calls and visits to check the salon. Meanwhile you can add your services and
        barbers.
      </p>
      {error && <Banner tone="bad">{error}</Banner>}
      <Button busy={busy} disabled={!ready} onClick={submit}>
        Submit for the visit
      </Button>
    </Page>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-muted">{label}</p>
      <p className="break-words">{value}</p>
    </div>
  )
}

/** The field team sent the registration back: what to fix before submitting again. */
function SentBack({ reason }: { reason: string }) {
  return (
    <Banner tone="warn">
      Our field team asked for a change: {reason} Fix it, then submit again.
    </Banner>
  )
}
