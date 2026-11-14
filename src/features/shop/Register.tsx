import { useQueryClient } from '@tanstack/react-query'
import { lazy, Suspense, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router'
import { fieldError, isApiError, messageOf } from '../../api/errors'
import { fileApi, ShopContext, shopApi, shopKeys, useMyShop, usePhotoLink, useShop } from '../../api/shop'
import type { AddressIn, AddressRequest, GeocodePrecision, RegistrationDocType, Shop, ShopDetailsIn } from '../../api/types'
import { LocationGuide } from '../../components/LocationGuide'
import { MapBoundary } from '../../components/MapBoundary'
import { PhotoPicker } from '../../components/PhotoPicker'
import { compact, normUdyam, validGstin, validUdyam } from '../../lib/gstin'
import { readyForVisit } from '../../lib/salonVideo'
import { clock12 } from '../../lib/ist'
import { weekLines } from '../../lib/salonHours'
import { addOwnerAsBarber, ownProfile, salonKeys, useSalonHours, useServices, useStaff } from '../../api/salon'
import { ClosedDaysEditor } from '../day/Closures'
import { SalonHoursEditor } from '../setup/SalonHours'
import { docLabel, RegistrationDocCard } from './RegistrationDoc'
import { RecheckWaiting } from './RecheckWaiting'
import { SalonVideo } from './SalonVideo'
import { Banner, Button, Card, ErrorState, Field, Loading, Page, Sheet } from '../../components/ui'
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
      {/* Stuck on a step, or sent back by the field team: help is one tap away on every step */}
      <Link to="/help" className="pb-6 text-center text-sm text-link underline">
        Need help? Write to support
      </Link>
    </ShopContext.Provider>
  )
}

/** Each step's screen, in order. */
export const STEP_PATHS = ['/register', '/register/photos', '/register/services', '/register/hours', '/register/review'] as const

/**
 * The step pills. Once the salon is saved (step 1 done), each pill is a link: the owner jumps straight to the step
 * he wants to fix instead of tapping Back or Continue through the others (the review step still checks everything).
 */
export function Steps({
  at,
  linked = at > 1,
  leaveWarning = null,
}: {
  at: 1 | 2 | 3 | 4 | 5
  linked?: boolean
  /** Asked before a pill leaves the page (unsaved typing, an upload under way). */
  leaveWarning?: string | null
}) {
  const names = ['Details', 'Photos', 'Services', 'Hours', 'Submit']
  return (
    <ol className="flex gap-2" aria-label="Registration steps">
      {names.map((n, i) => {
        const look = `block flex-1 rounded-full py-1 text-center text-xs font-semibold ${i + 1 <= at ? 'bg-brand text-brand-ink' : 'bg-raised text-muted'}`
        const text = (
          <>
            <span className="sr-only">{i + 1}. </span>
            {n}
          </>
        )
        return (
          <li key={n} className="flex flex-1" aria-current={i + 1 === at ? 'step' : undefined}>
            {linked && i + 1 !== at ? (
              <Link
                to={STEP_PATHS[i]}
                className={`${look} underline-offset-2 hover:underline`}
                onClick={(e) => {
                  if (leaveWarning && !window.confirm(leaveWarning)) e.preventDefault()
                }}
              >
                {text}
              </Link>
            ) : (
              <span className={look}>{text}</span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

type Form = Omit<ShopDetailsIn, 'latitude' | 'longitude' | 'gstin' | 'udyamNumber'> & {
  gstin: string
  udyamNumber: string
}

const empty: Form = { name: '', ownerName: '', addressLine: '', area: '', city: '', pincode: '', gstin: '', udyamNumber: '' }

/** The address fields of a request, as the form holds them. */
function addressOf(a: AddressIn): Pick<Form, 'addressLine' | 'area' | 'city' | 'pincode'> {
  return { addressLine: a.addressLine, area: a.area, city: a.city, pincode: a.pincode }
}

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
  // The backend's own checks (a typo in any one character of a GSTIN is caught by its last character)
  if (f.gstin.trim() && compact(f.gstin).length !== 15) e.gstin = 'A GSTIN has 15 letters and digits'
  else if (f.gstin.trim() && !validGstin(f.gstin)) e.gstin = 'This GSTIN has a typo: check each letter and digit'
  if (f.udyamNumber.trim() && !validUdyam(f.udyamNumber)) e.udyamNumber = `Write it like ${UDYAM_EXAMPLE}`
  return e
}

/** Step 1: the salon's details and its location pin. */
/**
 * Step 1: the salon's details and its pin. With `edit`, the same form after registration (the Salon tab → Salon
 * details, the owner only): it stays on the page with "Saved.", and on a live salon a changed address or pin is saved
 * only after the owner confirms it goes back to the field team.
 */
export function RegisterDetails({
  edit = false,
  request = null,
}: {
  edit?: boolean
  /**
   * Asking the field team for a new address (a verified salon, AddressRequestPage): only the address and pin, starting
   * from the request still waiting (else the salon's own); Send goes to them instead of saving.
   */
  request?: { start: AddressIn | null; waiting: boolean; onSent: (r: AddressRequest) => void; top: ReactNode } | null
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  // Opened from the review's "Edit details" (or a step pill there): saving goes back to it, not on to Photos
  const location = useLocation()
  const fromReview = !edit && new URLSearchParams(location.search).get('from') === 'review'
  const shop = useContext(ShopContext)
  const userId = useSession((s) => s.user?.id)
  /**
   * Verified by the field team: the address and pin are theirs to change now (the backend refuses ADDRESS_LOCKED); the
   * owner asks them (request mode, where they can be typed and moved again).
   */
  const locked = Boolean(shop?.addressLocked) && !request
  const start = request?.start ?? null
  const [form, setForm] = useState<Form>(() =>
    shop ? { ...formOf(shop), ...(start ? addressOf(start) : {}) } : { ...empty, ...loadRegisterDraft<Form>(userId) },
  )
  const [pin, setPin] = useState<Pin | null>(() =>
    start
      ? { lat: start.latitude, lng: start.longitude, gps: null, zoom: 18, placement: 0 }
      : shop
        ? { lat: shop.latitude, lng: shop.longitude, gps: null, zoom: 18, placement: 0 }
        : null,
  )
  /**
   * The details as last loaded or saved, to tell unsaved changes: the form as the backend stored it (capitals,
   * squeezed spaces), so a save never leaves a false "not saved", and a change made on another phone meanwhile isn't
   * taken for one made here.
   */
  const [baseline, setBaseline] = useState<{ form: Form; lat: number; lng: number } | null>(() =>
    shop
      ? start
        ? { form: { ...formOf(shop), ...addressOf(start) }, lat: start.latitude, lng: start.longitude }
        : { form: formOf(shop), lat: shop.latitude, lng: shop.longitude }
      : null,
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
  /**
   * The pin was taken again from GPS while the address fields were already filled (so nothing was filled from it):
   * the owner is asked to check the address still matches the new pin. Cleared when he edits an address field.
   */
  const [checkAddress, setCheckAddress] = useState(false)

  // Nothing is on the backend before the first save: keep the typing on this phone meanwhile.
  useEffect(() => {
    if (!shop && userId) saveRegisterDraft(userId, form)
  }, [form, shop, userId])

  useEffect(() => {
    void permissionState().then((s) => setBlocked(s === 'denied'))
  }, [locError])

  // Asking for a new address checks only the address (the other fields aren't on screen to fix)
  const problems = request
    ? Object.fromEntries(Object.entries(checkDetails(form)).filter(([k]) => (ADDRESS_FIELDS as readonly string[]).includes(k)))
    : checkDetails(form)
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setForm((f) => ({ ...f, [k]: value }))
    setSaved(false)
    setConfirmRecheck(false)
    if ((ADDRESS_FIELDS as readonly string[]).includes(k)) {
      setCheckAddress(false)
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
      else setCheckAddress(true)
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
      gstin: compact(form.gstin) || null,
      udyamNumber: normUdyam(form.udyamNumber) || null,
    }
    // A live salon's GSTIN and Udyam number are what the field team checked: changing one puts the salon in their
    // re-check (ShopService.update; it stays live). Say so first and save only on the second tap. (Its address can't
    // change: locked.) Compared as the backend stores them.
    const live = shop !== null && shop.status === 'APPROVED'
    const papers = live && ((details.gstin ?? null) !== (shop.gstin ?? null) || (details.udyamNumber ?? null) !== (shop.udyamNumber ?? null))
    if (edit && papers && !confirmRecheck) {
      setConfirmRecheck(true)
      return
    }
    // Locked: the address fields are read-only, so only the other details are sent (the backend would refuse a move)
    if (locked && shop) {
      details.addressLine = shop.addressLine
      details.area = shop.area
      details.city = shop.city
      details.pincode = shop.pincode
      details.latitude = shop.latitude
      details.longitude = shop.longitude
    }
    setBusy(true)
    setSaved(false)
    if (request && shop) {
      try {
        const sent = await shopApi.requestAddress(shop.version, {
          addressLine: details.addressLine,
          area: details.area,
          city: details.city,
          pincode: details.pincode,
          latitude: details.latitude,
          longitude: details.longitude,
        })
        setCheckAddress(false)
        setBaseline({ form: { ...form, ...addressOf(sent) }, lat: sent.latitude, lng: sent.longitude })
        setForm((f) => ({ ...f, ...addressOf(sent) }))
        // The salon has a new version (the field team's decision must see this request)
        await qc.invalidateQueries({ queryKey: shopKeys.mine })
        request.onSent(sent)
        setSaved(true)
      } catch (e) {
        // Changed meanwhile, or the answer was lost on the way (it may have gone through): read both again, so the
        // page shows what waits now and the next Send has the salon's version
        if (isApiError(e, 'SHOP_CHANGED') || isApiError(e, 'NETWORK') || (isApiError(e) && e.status === 0)) {
          await Promise.all([
            qc.invalidateQueries({ queryKey: shopKeys.mine }),
            qc.invalidateQueries({ queryKey: shopKeys.addressRequest }),
          ])
        }
        setError(e)
      } finally {
        setBusy(false)
      }
      return
    }
    try {
      const result = shop
        ? await shopApi.update(shop.version, { ...details, gstin: details.gstin ?? '', udyamNumber: details.udyamNumber ?? '' })
        : await shopApi.create(details)
      forgetRegisterDraft()
      qc.setQueryData(shopKeys.mine, result)
      setCheckAddress(false)
      // The form as stored now: nothing unsaved any more
      setForm(formOf(result))
      setBaseline({ form: formOf(result), lat: result.latitude, lng: result.longitude })
      if (fromReview) {
        navigate('/register/review')
      } else if (edit) {
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
          setBaseline({ form: formOf(newest), lat: newest.latitude, lng: newest.longitude })
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
  // Editing: something typed or moved that isn't saved yet (leaving asks first, so it isn't lost)
  // Something typed or moved since the last load or save (a saved draft too: the step pills leave this page)
  const dirty =
    baseline !== null &&
    !busy &&
    ((Object.keys(empty) as Array<keyof Form>).some((k) => form[k].trim() !== baseline.form[k].trim()) ||
      (pin !== null && (Math.abs(pin.lat - baseline.lat) > 1e-6 || Math.abs(pin.lng - baseline.lng) > 1e-6)))
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = UNSAVED
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  // Field errors show under their fields; the banner is for everything else.
  // EDIT_LOCKED: the code sheet comes up instead (EditGate), and after the code Save works
  const generalError =
    error && !isApiError(error, 'EDIT_LOCKED') && !Object.keys(empty).some((k) => fieldError(error, k)) ? messageOf(error) : null

  return (
    // A saved draft has no screen before this one ("/" comes back here), so no back arrow then
    <Page
      back={request ? cameFrom(location, '/setup/details') : edit ? cameFrom(location, '/setup') : shop ? undefined : '/start'}
      title={request ? 'Request address change' : edit ? 'Salon details' : 'Register your salon'}
      leaveWarning={dirty ? UNSAVED : null}
    >
      {!edit && !request && <Steps at={1} linked={shop !== null} leaveWarning={dirty ? UNSAVED : null} />}
      {edit && <RecheckWaiting />}
      {!edit && !request && shop?.statusReason && <SentBack reason={shop.statusReason} />}
      {request?.top}
      <Card className="flex flex-col gap-4">
        {request ? (
          <p className="text-sm text-muted">
            Type the new address and put the pin on the new door. Our field team checks it; until they approve it,
            customers see your salon at the old address and can book as usual.
          </p>
        ) : (
          <>
            <Field id="shop-name" label="Salon name" value={form.name} onChange={set('name')} maxLength={100} error={show('name')} />
            <Field
              id="owner-name"
              label="Owner’s name"
              hint="The salon owner’s name for our records. Your own sign-in name is changed in More."
              value={form.ownerName}
              onChange={set('ownerName')}
              maxLength={100}
              autoComplete="name"
              error={show('ownerName')}
            />
          </>
        )}
        <Field id="address" label="Shop number, building, street" value={form.addressLine} onChange={set('addressLine')} maxLength={200} readOnly={locked} error={show('addressLine')} />
        <Field id="area" label="Area" value={form.area} onChange={set('area')} maxLength={100} readOnly={locked} error={show('area')} />
        <div className="grid grid-cols-2 gap-3">
          <Field id="city" label="City" value={form.city} onChange={set('city')} maxLength={60} readOnly={locked} error={show('city')} />
          <Field id="pincode" label="Pincode" inputMode="numeric" value={form.pincode} onChange={set('pincode')} maxLength={6} readOnly={locked} error={show('pincode')} />
        </div>
        {locked && (
          <div id="address-locked" className="flex flex-col gap-1 text-sm">
            <p className="text-muted">
              Your address and pin were verified by our field team, so only they can change them. Moved, or something
              is wrong? Send them the new one.
            </p>
            <Link
              to="/setup/address"
              state={{ from: edit ? '/setup/details' : '/register' }}
              className="self-start text-link underline"
              onClick={(e) => {
                if (dirty && !window.confirm(UNSAVED)) e.preventDefault()
              }}
            >
              Request address change
            </Link>
          </div>
        )}
      </Card>

      {locked && shop ? (
        <Card className="flex flex-col gap-2">
          <p className="font-semibold">Salon location</p>
          <MapBoundary>
            <Suspense fallback={<Loading label="Loading the map…" />}>
              <PinMap lat={shop.latitude} lng={shop.longitude} />
            </Suspense>
          </MapBoundary>
        </Card>
      ) : (
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
            <MapBoundary>
              <Suspense fallback={<Loading label="Loading the map…" />}>
                <PinMap lat={pin.lat} lng={pin.lng} zoom={pin.zoom} placement={pin.placement} onMove={moveByHand} />
              </Suspense>
            </MapBoundary>
            <p className="text-sm text-muted">
              Drag the pin to your door if it's off.
              {pin.gps && ` GPS was accurate to about ${pin.gps.accuracy} m.`}
              {moved > 0 && ` Moved ${moved} m from the GPS point.`}
            </p>
            {pin.gps && pin.gps.accuracy > ROUGH_METRES && (
              <Banner tone="warn">The phone isn't sure where it is. Go near the door or a window, then take it again.</Banner>
            )}
            {!insideIndia(pin.lat, pin.lng) && <Banner tone="bad">The pin must be in India.</Banner>}
            {checkAddress && (
              <Banner tone="info">
                The pin moved to where you are. Check that the address above still matches it, and change it if not.
              </Banner>
            )}
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
      )}

      {!request && (
      <Card className="flex flex-col gap-4">
        <p className="text-sm text-muted">Optional. You can add these later.</p>
        <Field id="gstin" label="GSTIN" value={form.gstin} onChange={set('gstin')} maxLength={20} autoCapitalize="characters" placeholder="27AAPFU0939F1ZV" error={show('gstin')} />
        <Field id="udyam" label="Udyam number" value={form.udyamNumber} onChange={set('udyamNumber')} maxLength={25} autoCapitalize="characters" placeholder={UDYAM_EXAMPLE} error={show('udyamNumber')} />
      </Card>
      )}

      {generalError && <Banner tone="bad">{generalError}</Banner>}
      {confirmRecheck && (
        <Banner tone="warn">
          A new GSTIN or Udyam number goes to our field team for a check. Your salon stays live and bookable meanwhile.
          Tap Save again to go ahead.
        </Banner>
      )}
      {saved && <Banner tone="good">{request ? 'Sent to our field team. Your salon keeps its address until they approve it.' : 'Saved.'}</Banner>}
      <Button busy={busy} onClick={save}>
        {request ? (request.waiting ? 'Send the changed request' : 'Send to the field team') : edit ? (confirmRecheck ? 'Save and send for a check' : 'Save') : 'Save and continue'}
      </Button>
      {!edit && !request && (
        <Button variant="ghost" onClick={() => signOutHere(qc).then(() => navigate('/signin', { replace: true }))}>
          Sign out
        </Button>
      )}
      {!edit && !request && shop && <DraftExits name={shop.name} />}
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
 * and the optional registration document. With `edit`, the photos and video after registration (the Salon tab →
 * Photos and video, the owner only); the document has its own page there.
 */
export function RegisterPhotos({ edit = false }: { edit?: boolean }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const shop = useShop()
  const location = useLocation()
  // Opened from the review's "Change": Continue goes back to it
  const fromReview = !edit && new URLSearchParams(location.search).get('from') === 'review'
  /** How many photo uploads are under way (leaving asks first meanwhile). */
  const [photosBusy, setPhotosBusy] = useState(0)
  const photoBusy = useCallback((busy: boolean) => setPhotosBusy((n) => Math.max(0, n + (busy ? 1 : -1))), [])

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
      back={edit ? cameFrom(location, '/setup') : fromReview ? '/register/review' : '/register'}
      title={edit ? 'Photos and video' : 'Photos and papers'}
      leaveWarning={videoBusy ? LEAVE_DURING_UPLOAD : docBusy ? LEAVE_DURING_DOCUMENT : photosBusy ? LEAVE_DURING_PHOTO : null}
    >
      {!edit && (
        <Steps
          at={2}
          leaveWarning={videoBusy ? LEAVE_DURING_UPLOAD : docBusy ? LEAVE_DURING_DOCUMENT : photosBusy ? LEAVE_DURING_PHOTO : null}
        />
      )}
      {!edit && shop.statusReason && <SentBack reason={shop.statusReason} />}
      {edit && shop.status === 'APPROVED' && (
        <Banner tone="info">
          A new photo or video goes to our field team for a check. Your salon stays live and bookable meanwhile.
        </Banner>
      )}
      {edit && <RecheckWaiting />}
      <PhotoPicker
        label="Your photo"
        hint="A clear photo of your face. Only our field team sees it, to know who to meet."
        capture="user"
        fileId={shop.ownerPhotoFileId}
        upload={(p) => setPhoto('OWNER_PHOTO', p)}
        onBusy={photoBusy}
      />
      <PhotoPicker
        label="Shop front"
        hint="From outside, with the board visible. Customers see this photo."
        capture="environment"
        fileId={shop.shopPhotoFileId}
        upload={(p) => setPhoto('SHOP_PHOTO', p)}
        onBusy={photoBusy}
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
          <Button
            disabled={!done || videoBusy || docBusy || photosBusy > 0}
            onClick={() => navigate(fromReview ? '/register/review' : '/register/services')}
          >
            {fromReview ? 'Back to the review' : 'Continue'}
          </Button>
          {!done && <p className="text-center text-sm text-muted">Both photos and the salon video are needed.</p>}
        </>
      )}
    </Page>
  )
}

const UNSAVED = 'Your changes aren’t saved. Leave anyway?'

/** Where Back goes on an edit page: the screen that opened it (More passes `from`), else `fallback` (the Salon tab). */
export function cameFrom(location: { state: unknown }, fallback: string): string {
  const from = (location.state as { from?: unknown } | null)?.from
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : fallback
}
const UDYAM_EXAMPLE = 'UDYAM-TS-02-0012345'

const LEAVE_DURING_UPLOAD = 'The salon video is still uploading. Leave anyway? It will have to be sent again.'
const LEAVE_DURING_DOCUMENT = 'The registration document is still uploading. Leave anyway? It may not be saved.'
const LEAVE_DURING_PHOTO = 'A photo is still uploading. Leave anyway? It may not be saved.'

/** Step 4: the salon's opening hours and weekly off. */
export function RegisterHours() {
  const navigate = useNavigate()
  const shop = useShop()
  const hours = useSalonHours()
  return (
    <Page back="/register/services" title="Opening hours">
      <Steps at={4} />
      {shop.statusReason && <SentBack reason={shop.statusReason} />}
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
              ? "You're one of the barbers: customers can book your chair. Change your services and hours in the Salon tab → Barbers."
              : "Your barber profile is switched off, so customers can't book your chair. Switch it on in the Salon tab → Barbers."}
          </p>
        </div>
      </Card>
    )
  }
  if (no) {
    return (
      <div ref={answer} tabIndex={-1} role="status" className="text-sm text-muted outline-none">
        Only your staff cut hair. If that changes, add yourself in the Salon tab → Barbers.
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
          opening hours; change that any time in the Salon tab → Barbers.
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
  // "Are you sure?" before the registration goes to the field team: the last chance to check, said in words
  const [asking, setAsking] = useState(false)
  const photos = Boolean(shop.ownerPhotoFileId && shop.shopPhotoFileId)
  const video = Boolean(shop.shopVideoFileId)
  const doc = Boolean(shop.registrationDocFileId)
  const offered = services.data?.filter((s) => s.active).length ?? 0
  const open = hours.data?.days ?? []
  const ready = readyForVisit(shop) && offered > 0 && open.length > 0

  // Two taps before React re-renders would both see busy=false: a ref holds the first one
  const sending = useRef(false)

  async function submit() {
    if (sending.current) return
    sending.current = true
    setBusy(true)
    setError(null)
    try {
      qc.setQueryData(shopKeys.mine, await shopApi.submit(shop.version))
      navigate('/', { replace: true })
    } catch (e) {
      // The reason shows on the review itself, next to what needs fixing
      setAsking(false)
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
      sending.current = false
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
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted">Pin on the map (customers find you here)</p>
          <MapBoundary>
            <Suspense fallback={<Loading label="Loading the map…" />}>
              <PinMap lat={shop.latitude} lng={shop.longitude} />
            </Suspense>
          </MapBoundary>
        </div>
        {shop.gstin && <Line label="GSTIN" value={shop.gstin} />}
        {shop.udyamNumber && <Line label="Udyam" value={shop.udyamNumber} />}
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
        {/* Small, to check the right pictures went in without opening the step */}
        <div className="grid grid-cols-2 gap-2">
          <Thumb fileId={shop.ownerPhotoFileId} label="Your photo" />
          <Thumb fileId={shop.shopPhotoFileId} label="Shop front" />
        </div>
      </Card>
      <Card className="flex items-center justify-between">
        <span>Salon video: {video ? 'added' : 'missing'}</span>
        <Link to="/register/photos?from=review" className="text-sm text-link underline">
          {video ? 'Change' : 'Add'}
        </Link>
      </Card>
      <Card className="flex items-center justify-between gap-2">
        <span>Registration document: {doc ? docLabel(shop.registrationDocType) : 'not added (optional)'}</span>
        <Link to="/register/photos?from=review" className="shrink-0 text-sm text-link underline">
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
          Days the whole salon is closed, such as Diwali. You can add more later in the Salon tab → Closed days.
        </p>
        <ClosedDaysEditor optional />
      </section>
      <OwnerAsBarber />
      <p className="text-sm text-muted">
        After you submit, our field team calls and visits to check the salon. Meanwhile you can add your barbers.
      </p>
      {error && <Banner tone="bad">{error}</Banner>}
      <Button disabled={!ready} onClick={() => setAsking(true)}>
        Submit for the visit
      </Button>
      <Sheet open={asking} title="Submit for the field visit?" onClose={() => !busy && setAsking(false)}>
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-1 rounded-xl border border-line bg-raised px-4 py-3 text-sm">
            <li className="font-semibold">{shop.name}</li>
            <li className="text-muted">{`${shop.addressLine}, ${shop.area}, ${shop.city} ${shop.pincode}`}</li>
            <li>
              {offered} {offered === 1 ? 'service' : 'services'} · open {open.length} {open.length === 1 ? 'day' : 'days'} a week
            </li>
          </ul>
          <p className="text-muted">
            After you submit, our field team calls you to fix a time and visits {shop.name}. Customers can book once
            it's approved.
          </p>
          <p className="text-sm text-muted">Something to fix first? Tap Not yet. You can also change details later.</p>
          {/* Not yet first: the sheet focuses it, so a held Enter can't submit by itself */}
          <Button variant="secondary" disabled={busy} onClick={() => setAsking(false)}>
            Not yet
          </Button>
          <Button busy={busy} onClick={submit}>
            Yes, submit
          </Button>
        </div>
      </Sheet>
      {/* Coming back lands here: not going ahead is one tap away, as on step 1 */}
      <DraftExits name={shop.name} />
    </Page>
  )
}

/** A photo, small, on the review step (or a dash while there is none). */
function Thumb({ fileId, label }: { fileId: string | null; label: string }) {
  const link = usePhotoLink(fileId)
  return (
    <figure className="flex flex-col gap-1">
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-line bg-raised">
        {link.data?.url ? (
          <img src={link.data.url} alt={label} className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-muted">{fileId ? '…' : 'Not added'}</span>
        )}
      </div>
      <figcaption className="text-xs text-muted">{label}</figcaption>
    </figure>
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
export function SentBack({ reason }: { reason: string }) {
  return (
    <Banner tone="warn">
      Our field team asked for a change: {reason} Fix it, then submit again.
    </Banner>
  )
}
