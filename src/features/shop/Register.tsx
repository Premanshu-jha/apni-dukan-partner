import { useQueryClient } from '@tanstack/react-query'
import { lazy, Suspense, useContext, useEffect, useRef, useState } from 'react'
import { Link, Navigate, Outlet, useNavigate } from 'react-router'
import { fieldError, isApiError, messageOf } from '../../api/errors'
import { fileApi, ShopContext, shopApi, shopKeys, useMyShop, useShop } from '../../api/shop'
import type { GeocodePrecision, RegistrationDocType, Shop, ShopDetailsIn } from '../../api/types'
import { LocationGuide } from '../../components/LocationGuide'
import { PhotoPicker } from '../../components/PhotoPicker'
import { readyForVisit } from '../../lib/salonVideo'
import { clock12 } from '../../lib/ist'
import { weekLines } from '../../lib/salonHours'
import { addOwnerAsBarber, ownProfile, salonKeys, useSalonHours, useServices, useStaff } from '../../api/salon'
import { ClosedDaysEditor } from '../day/Closures'
import { SalonHoursEditor } from '../setup/SalonHours'
import { docLabel, RegistrationDocCard } from './RegistrationDoc'
import { SalonVideo } from './SalonVideo'
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

export function Steps({ at }: { at: 1 | 2 | 3 | 4 | 5 }) {
  const names = ['Details', 'Photos', 'Services', 'Hours', 'Submit']
  return (
    <ol className="flex gap-2" aria-label="Registration steps">
      {names.map((n, i) => (
        <li
          key={n}
          aria-current={i + 1 === at ? 'step' : undefined}
          className={`flex-1 rounded-full py-1 text-center text-xs font-semibold ${i + 1 <= at ? 'bg-brand text-brand-ink' : 'bg-raised text-muted'}`}
        >
          <span className="sr-only">{i + 1}. </span>
          {n}
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
/**
 * Step 1: the salon's details and its pin. With `edit`, the same form after registration (More → Salon → Salon
 * details, the owner only): it stays on the page with "Saved.", and on a live salon a changed address or pin is saved
 * only after the owner confirms it goes back to the field team.
 */
export function RegisterDetails({ edit = false }: { edit?: boolean }) {
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
  /** Editing: saved just now; and the owner was asked to confirm a re-check (address or pin of a live salon). */
  const [saved, setSaved] = useState(false)
  const [confirmRecheck, setConfirmRecheck] = useState(false)

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
    setSaved(false)
    setConfirmRecheck(false)
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
    // A live salon's address or pin is what the field team checked: changing it sends the salon back to them
    // (ShopService.update). Say so and save only on the second tap.
    // As the backend compares them (TextCleaner squeezes inner spaces)
    const same = (a: string, b: string) => a.replace(/\s+/g, ' ') === b.replace(/\s+/g, ' ')
    const moves =
      shop !== null &&
      shop.status === 'APPROVED' &&
      (!same(details.addressLine, shop.addressLine) ||
        !same(details.area, shop.area) ||
        !same(details.city, shop.city) ||
        details.pincode !== shop.pincode ||
        Math.abs(details.latitude - shop.latitude) > 1e-6 ||
        Math.abs(details.longitude - shop.longitude) > 1e-6)
    if (edit && moves && !confirmRecheck) {
      setConfirmRecheck(true)
      return
    }
    setBusy(true)
    setSaved(false)
    try {
      const result = shop
        ? await shopApi.update(shop.version, { ...details, gstin: details.gstin ?? '', udyamNumber: details.udyamNumber ?? '' })
        : await shopApi.create(details)
      forgetRegisterDraft()
      qc.setQueryData(shopKeys.mine, result)
      if (edit) {
        setSaved(true)
        setConfirmRecheck(false)
      } else {
        navigate('/register/photos')
      }
    } catch (e) {
      if (isApiError(e, 'ALREADY_HAS_SHOP') || isApiError(e, 'SHOP_CHANGED')) {
        // Registered from another tab or phone, or changed meanwhile: start from what the backend has.
        await qc.invalidateQueries({ queryKey: shopKeys.mine })
        // Editing a live salon: the form shows the newest details, so the next Save can't undo the other change
        const newest = qc.getQueryData<Shop>(shopKeys.mine)
        if (edit && newest) {
          setForm(formOf(newest))
          setPin({ lat: newest.latitude, lng: newest.longitude, gps: null, zoom: 18, placement: 0 })
          setConfirmRecheck(false)
        }
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
    <Page back={edit ? '/setup' : shop ? undefined : '/start'} title={edit ? 'Salon details' : 'Register your salon'}>
      {!edit && <Steps at={1} />}
      {!edit && shop?.statusReason && <SentBack reason={shop.statusReason} />}
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
      {confirmRecheck && (
        <Banner tone="warn">
          A new address or pin goes to our field team for a check: your salon is hidden from customers until they
          approve it again. Bookings already made stay. Tap Save again to go ahead.
        </Banner>
      )}
      {saved && <Banner tone="good">Saved.</Banner>}
      <Button busy={busy} onClick={save}>
        {edit ? (confirmRecheck ? 'Save and send for a check' : 'Save') : 'Save and continue'}
      </Button>
      {!edit && (
        <Button variant="ghost" onClick={() => signOutHere(qc).then(() => navigate('/signin', { replace: true }))}>
          Sign out
        </Button>
      )}
      {!edit && shop && <DraftExits name={shop.name} />}
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

/**
 * Step 2: the owner's photo (for the field team), the shop front (customers see it) and the salon video (field team),
 * and the optional registration document. With `edit`, the photos and video after registration (More → Salon →
 * Photos and video, the owner only); the document has its own page there.
 */
export function RegisterPhotos({ edit = false }: { edit?: boolean }) {
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

  /**
   * Sets the salon video on the shop, after any photo save still under way (each needs the version the last left).
   * Someone else saved the shop meanwhile (409 SHOP_CHANGED): the shop is read again and the save tried once more;
   * a second refusal goes to the card, which says to reload.
   */
  function setVideo(fileId: string, signal: AbortSignal) {
    const attempt = async () => {
      // Left the page meanwhile (the card is gone): nothing more is saved
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
      const latest = qc.getQueryData<Shop>(shopKeys.mine) ?? shop
      qc.setQueryData(shopKeys.mine, await shopApi.setVideo(latest.version, fileId))
    }
    const run = queue.current
      .catch(() => undefined)
      .then(async () => {
        try {
          await attempt()
        } catch (e) {
          if (!isApiError(e, 'SHOP_CHANGED')) throw e
          await qc.refetchQueries({ queryKey: shopKeys.mine, exact: true })
          await attempt()
        }
      })
    queue.current = run
    return run
  }

  /** The registration document, after any photo or video save under way (each needs the version the last left). */
  function setDocument(type: RegistrationDocType, fileId: string) {
    const run = queue.current
      .catch(() => undefined)
      .then(async () => {
        const latest = qc.getQueryData<Shop>(shopKeys.mine) ?? shop
        try {
          qc.setQueryData(shopKeys.mine, await shopApi.setRegistrationDoc(latest.version, type, fileId))
        } catch (e) {
          if (isApiError(e, 'SHOP_CHANGED')) await qc.invalidateQueries({ queryKey: shopKeys.mine })
          throw e
        }
      })
    queue.current = run
    return run
  }

  /** A wrong document uploaded: off again (it's optional), after any save under way. */
  function removeDocument() {
    const run = queue.current
      .catch(() => undefined)
      .then(async () => {
        const latest = qc.getQueryData<Shop>(shopKeys.mine) ?? shop
        try {
          qc.setQueryData(shopKeys.mine, await shopApi.removeRegistrationDoc(latest.version))
        } catch (e) {
          if (isApiError(e, 'SHOP_CHANGED')) await qc.invalidateQueries({ queryKey: shopKeys.mine })
          throw e
        }
      })
    queue.current = run
    return run
  }

  const [videoBusy, setVideoBusy] = useState(false)
  const [docBusy, setDocBusy] = useState(false)
  const done = readyForVisit(shop)
  return (
    <Page
      back={edit ? '/setup' : '/register'}
      title={edit ? 'Photos and video' : 'Photos and papers'}
      leaveWarning={videoBusy ? LEAVE_DURING_UPLOAD : docBusy ? LEAVE_DURING_DOCUMENT : null}
    >
      {!edit && <Steps at={2} />}
      {edit && shop.status === 'APPROVED' && (
        <Banner tone="warn">
          A new photo or video goes to our field team for a check: your salon is hidden from customers until they
          approve it again. Bookings already made stay.
        </Banner>
      )}
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
      <SalonVideo fileId={shop.shopVideoFileId ?? null} save={setVideo} onBusy={setVideoBusy} />
      {!edit && (
        <>
          <RegistrationDocCard
            type={shop.registrationDocType ?? null}
            fileId={shop.registrationDocFileId ?? null}
            save={setDocument}
            remove={removeDocument}
            onBusy={setDocBusy}
          />
          {/* Not while the document is still on its way: its error would have nowhere to show */}
          <Button disabled={!done || videoBusy || docBusy} onClick={() => navigate('/register/services')}>
            Continue
          </Button>
          {!done && <p className="text-center text-sm text-muted">Both photos and the salon video are needed.</p>}
        </>
      )}
    </Page>
  )
}

const LEAVE_DURING_UPLOAD = 'The salon video is still uploading. Leave anyway? It will have to be sent again.'
const LEAVE_DURING_DOCUMENT = 'The registration document is still uploading. Leave anyway? It may not be saved.'

/** Step 4: the salon's opening hours and weekly off. */
export function RegisterHours() {
  const navigate = useNavigate()
  const hours = useSalonHours()
  return (
    <Page back="/register/services" title="Opening hours">
      <Steps at={4} />
      {hours.isPending ? (
        <Loading />
      ) : hours.isError && !hours.data ? (
        <ErrorState message={messageOf(hours.error)} onRetry={() => hours.refetch()} />
      ) : (
        <SalonHoursEditor
          hours={hours.data}
          saveLabel="Save and continue"
          onSaved={() => navigate('/register/review')}
        />
      )}
      {hours.data && hours.data.days.length > 0 && (
        <Link to="/register/review" className="text-center text-sm text-link underline">
          Keep these hours and continue
        </Link>
      )}
    </Page>
  )
}

/**
 * "Do you cut hair here yourself?": yes adds the owner as a barber (his own sign-in, every service, the salon's
 * hours), so customers can book his chair too. Once he is one, it says so.
 */
export function OwnerAsBarber() {
  const qc = useQueryClient()
  const staff = useStaff()
  const phone = useSession((s) => s.user?.phone ?? null)
  const [no, setNo] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // After Yes or No the buttons go: the answer takes the focus, so a screen reader hears it and the place isn't lost
  const answer = useRef<HTMLDivElement>(null)
  const [answered, setAnswered] = useState(false)
  useEffect(() => {
    if (answered) answer.current?.focus()
  }, [answered, no, staff.data])
  if (staff.isError && !staff.data) {
    return (
      <Card>
        <p className="font-semibold">Do you cut hair here yourself?</p>
        <ErrorState message={`Couldn't read your barbers. ${messageOf(staff.error)}`} onRetry={() => staff.refetch()} />
      </Card>
    )
  }
  if (!staff.data) return null
  const mine = ownProfile(staff.data, phone)
  if (mine) {
    return (
      <Card>
        <div ref={answer} tabIndex={-1} role="status" className="outline-none">
          <p className="text-sm">
            {mine.active
              ? "You're one of the barbers: customers can book your chair. Change your services and hours in More → Barbers."
              : "Your barber profile is switched off, so customers can't book your chair. Switch it on in More → Barbers."}
          </p>
        </div>
      </Card>
    )
  }
  if (no) {
    return (
      <div ref={answer} tabIndex={-1} role="status" className="text-sm text-muted outline-none">
        Only your staff cut hair. If that changes, add yourself in More → Barbers.
      </div>
    )
  }
  async function addMe() {
    setBusy(true)
    setError(null)
    try {
      await addOwnerAsBarber(qc)
      setAnswered(true)
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <p className="font-semibold">Do you cut hair here yourself?</p>
        <p className="text-sm text-muted">
          If yes, we'll add you as a barber, so customers can book your chair too. You'll do all your services in the
          opening hours; change that any time in More → Barbers.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button busy={busy} onClick={addMe}>
          Yes, add me
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            setNo(true)
            setAnswered(true)
          }}
        >
          No, only staff
        </Button>
      </div>
      {error && <Banner tone="bad">{error}</Banner>}
    </Card>
  )
}

/** Step 5: check everything and ask for the field team's visit. */
export function RegisterReview() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const shop = useShop()
  const services = useServices()
  const hours = useSalonHours()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const photos = Boolean(shop.ownerPhotoFileId && shop.shopPhotoFileId)
  const video = Boolean(shop.shopVideoFileId)
  const doc = Boolean(shop.registrationDocFileId)
  const offered = services.data?.filter((s) => s.active).length ?? 0
  const open = hours.data?.days ?? []
  const ready = readyForVisit(shop) && offered > 0 && open.length > 0

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
      if (isApiError(e, 'REGISTRATION_INCOMPLETE')) {
        await Promise.all([
          qc.invalidateQueries({ queryKey: shopKeys.mine }),
          qc.invalidateQueries({ queryKey: salonKeys.services }),
          qc.invalidateQueries({ queryKey: salonKeys.hours }),
        ])
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page back="/register/hours" title="Check and submit">
      <Steps at={5} />
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
        <span>Photos: {photos ? 'both added' : 'missing'}</span>
        <Link to="/register/photos" className="text-sm text-link underline">
          {photos ? 'Change' : 'Add'}
        </Link>
      </Card>
      <Card className="flex items-center justify-between">
        <span>Salon video: {video ? 'added' : 'missing'}</span>
        <Link to="/register/photos" className="text-sm text-link underline">
          {video ? 'Change' : 'Add'}
        </Link>
      </Card>
      <Card className="flex items-center justify-between gap-2">
        <span>Registration document: {doc ? docLabel(shop.registrationDocType) : 'not added (optional)'}</span>
        <Link to="/register/photos" className="shrink-0 text-sm text-link underline">
          {doc ? 'Change' : 'Add'}
        </Link>
      </Card>
      {(services.isError || hours.isError) && !(services.data && hours.data) && (
        <Banner tone="bad">
          Couldn't read your services or hours. {messageOf(services.error ?? hours.error)}{' '}
          <button
            type="button"
            className="underline"
            onClick={() => {
              void services.refetch()
              void hours.refetch()
            }}
          >
            Try again
          </button>
        </Banner>
      )}
      <Card className="flex items-center justify-between">
        <span>Services: {!services.data ? '…' : offered ? `${offered} added` : 'missing'}</span>
        <Link to="/register/services" className="text-sm text-link underline">
          {offered ? 'Change' : 'Add'}
        </Link>
      </Card>
      <Card className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span>Opening hours{!hours.data ? ': …' : !open.length ? ': missing' : ''}</span>
          <Link to="/register/hours" className="text-sm text-link underline">
            {open.length ? 'Change' : 'Set'}
          </Link>
        </div>
        {open.length > 0 && weekLines(open, clock12).map((l) => (
          <p key={l} className="text-sm text-muted">
            {l}
          </p>
        ))}
      </Card>
      <section aria-labelledby="holidays" className="flex flex-col gap-2">
        <h2 id="holidays" className="font-semibold">
          Festival holidays (optional)
        </h2>
        <p className="text-sm text-muted">
          Days the whole salon is closed, such as Diwali. You can add more later in More → Closed days.
        </p>
        <ClosedDaysEditor optional />
      </section>
      <OwnerAsBarber />
      <p className="text-sm text-muted">
        After you submit, our field team calls and visits to check the salon. Meanwhile you can add your barbers.
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
