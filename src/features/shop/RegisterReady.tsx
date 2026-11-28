import { useContext, useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { ShopContext } from '../../api/shop'
import { Button, Card, Page } from '../../components/ui'
import { useT } from '../../i18n'
import { kiranaOn } from '../../lib/config'
import { loadRegisterReady, saveRegisterReady } from '../../lib/registerDraft'
import { VIDEO_MAX_SECONDS, VIDEO_MIN_SECONDS } from '../../lib/salonVideo'
import { useSession } from '../../store/session'
import { pickedKind } from './Register'
import { startWords } from './Start'

/** A shop with a map pin over it: "be at your shop". Our own drawing. */
function ShopPinPicture() {
  return (
    <svg viewBox="0 0 160 96" className="mx-auto h-24 w-auto" aria-hidden="true" focusable="false">
      <rect x="30" y="40" width="100" height="48" rx="4" fill="none" stroke="currentColor" strokeWidth="3" className="text-line" />
      <path d="M24 42 L40 22 H120 L136 42 Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" className="text-line" />
      <rect x="68" y="58" width="24" height="30" rx="2" fill="none" stroke="currentColor" strokeWidth="3" className="text-line" />
      <rect x="40" y="52" width="18" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="3" className="text-line" />
      <rect x="102" y="52" width="18" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="3" className="text-line" />
      <path d="M80 4c-8 0-14 6-14 14 0 10 14 24 14 24s14-14 14-24c0-8-6-14-14-14z" fill="currentColor" className="text-link" />
      <circle cx="80" cy="18" r="5" fill="currentColor" className="text-surface" />
    </svg>
  )
}

const icon = 'h-7 w-7 shrink-0 text-link'
const PinIcon = () => (
  <svg viewBox="0 0 24 24" className={icon} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
    <path d="M12 22s7-7 7-12a7 7 0 1 0-14 0c0 5 7 12 7 12z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
)
const CameraIcon = () => (
  <svg viewBox="0 0 24 24" className={icon} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
)
const PaperIcon = () => (
  <svg viewBox="0 0 24 24" className={icon} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M6 3h9l4 4v14H6z" />
    <path d="M9 12h7M9 16h7M9 8h3" />
  </svg>
)
function Point({ pic, title, body }: { pic: React.ReactNode; title: string; body: string }) {
  return (
    <li className="flex gap-3">
      {pic}
      <span className="flex flex-col gap-0.5">
        <span className="font-semibold">{title}</span>
        <span className="text-sm text-muted">{body}</span>
      </span>
    </li>
  )
}

/**
 * "Before you start": the screen between "What do you run?" (or Start, with the kirana switch off) and registration's
 * first step, worded for the kind picked. Be at the shop (its location comes from the phone), the two photos and the
 * video, and the papers to keep handy for that kind (how long it takes, in the line above them). "I'm at my shop" goes on
 * to step 1 and isn't asked again on this phone (nor here: answered, this screen goes straight on); "I'm not at my shop
 * now" says it can wait, with nothing lost.
 */
export function RegisterReady() {
  const t = useT()
  const navigate = useNavigate()
  const shop = useContext(ShopContext)
  const userId = useSession((s) => s.user?.id)
  const kind = pickedKind(userId)
  const [later, setLater] = useState(false)
  // How many steps back Start is (1 from Start, 2 from "What do you run?"): OK goes back there, not a second Start
  const stepsFromStart = (useLocation().state as { stepsFromStart?: number } | null)?.stepsFromStart
  const laterTitle = useRef<HTMLParagraphElement>(null)
  // The button tapped is gone: the answer that replaced it is read next
  useEffect(() => {
    if (later) laterTitle.current?.focus()
  }, [later])

  // Already saved (a draft shop): its steps are under way, nothing to get ready for
  if (shop) return <Navigate to="/register" replace />
  // The kind comes first ("What do you run?"); this screen is worded for it
  if (!kind) return <Navigate to="/register/kind" replace />
  // Answered already (the kind changed on step 1, or Start's button again): straight on
  if (loadRegisterReady(userId)) return <Navigate to="/register" replace />

  const kirana = kind === 'KIRANA'
  const k = (salon: string, shopKey: string) => t(kirana ? shopKey : salon)

  function start() {
    if (userId) saveRegisterReady(userId)
    navigate('/register', { replace: true })
  }

  return (
    <Page back={kiranaOn() ? '/register/kind' : '/start'} title={t('register.readyTitle')}>
      <ShopPinPicture />
      {!later ? (
        <>
          <p className="text-muted">{t('register.readyIntro')}</p>
          <ul className="flex flex-col gap-4" aria-label={t('register.readyTitle')}>
            <Point pic={<PinIcon />} title={k('register.readyBeThere', 'register.readyBeThereKirana')} body={k('register.readyBeThereBody', 'register.readyBeThereBodyKirana')} />
            <Point
              pic={<CameraIcon />}
              title={t('register.readyPhotos')}
              body={t('register.readyPhotosBody', { min: VIDEO_MIN_SECONDS, max: VIDEO_MAX_SECONDS })}
            />
            <Point pic={<PaperIcon />} title={k('register.readyPapers', 'register.readyPapersKirana')} body={k('register.readyPapersBody', 'register.readyPapersBodyKirana')} />
          </ul>
          <Button onClick={start} className="py-2 text-center">
            {k('register.readyStart', 'register.readyStartKirana')}
          </Button>
          <Button variant="secondary" onClick={() => setLater(true)} className="py-2 text-center">
            {k('register.readyNotThere', 'register.readyNotThereKirana')}
          </Button>
        </>
      ) : (
        <Card className="flex flex-col gap-3">
          <p ref={laterTitle} tabIndex={-1} className="text-lg font-semibold outline-none">
            {t('register.readyLaterTitle')}
          </p>
          <p className="text-muted">
            {t(kirana ? 'register.readyLaterBodyKirana' : 'register.readyLaterBody', { button: t(startWords().register) })}
          </p>
          <Button onClick={() => (stepsFromStart ? navigate(-stepsFromStart) : navigate('/start', { replace: true }))}>{t('register.readyLaterOk')}</Button>
          <Button variant="ghost" onClick={() => setLater(false)} className="py-2 text-center">
            {k('register.readyAtShopNow', 'register.readyAtShopNowKirana')}
          </Button>
        </Card>
      )}
    </Page>
  )
}
