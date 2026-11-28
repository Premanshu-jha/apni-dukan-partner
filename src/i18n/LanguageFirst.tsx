import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { Page } from '../components/ui'
import { Brand } from '../features/auth/Brand'
import { LANGUAGES, browserLanguage, languageChosen, setLanguage, useLanguage, useT, type Lang } from './index'

/**
 * "Choose your language" in each language, in its own script: the first screen is read before any language is
 * chosen, so its question can't wait for a download.
 */
const ASK: Record<Lang, string> = {
  en: 'Choose your language',
  hi: 'अपनी भाषा चुनें',
  te: 'మీ భాష ఎంచుకోండి',
  mr: 'तुमची भाषा निवडा',
  ta: 'உங்கள் மொழியைத் தேர்ந்தெடுங்கள்',
  kn: 'ನಿಮ್ಮ ಭಾಷೆ ಆರಿಸಿ',
}

/**
 * A language that couldn't be downloaded, said in that language (the person tapped it because they read it), with
 * English as the way on: English is in the app and always works.
 */
const OFFLINE: Record<Lang, string> = {
  en: "Couldn't download this language. Turn on the internet and tap it again, or tap English.",
  hi: 'भाषा डाउनलोड नहीं हो पाई। इंटरनेट चालू करके फिर से टैप करें, या English चुनें।',
  te: 'భాష డౌన్‌లోడ్ కాలేదు. ఇంటర్నెట్ ఆన్ చేసి మళ్లీ నొక్కండి, లేదా English ఎంచుకోండి.',
  mr: 'भाषा डाउनलोड झाली नाही. इंटरनेट चालू करून पुन्हा टॅप करा, किंवा English निवडा.',
  ta: 'மொழியைப் பதிவிறக்க முடியவில்லை. இணையத்தை இயக்கி மீண்டும் தட்டுங்கள், அல்லது English-ஐத் தேர்ந்தெடுங்கள்.',
  kn: 'ಭಾಷೆ ಡೌನ್‌ಲೋಡ್ ಆಗಲಿಲ್ಲ. ಇಂಟರ್ನೆಟ್ ಆನ್ ಮಾಡಿ ಮತ್ತೆ ಒತ್ತಿ, ಅಥವಾ English ಆರಿಸಿ.',
}

/** Each language's name in English, under its own script: for someone helping who reads only English. */
const IN_ENGLISH: Record<Lang, string> = { en: 'English', hi: 'Hindi', te: 'Telugu', mr: 'Marathi', ta: 'Tamil', kn: 'Kannada' }

/**
 * Where the language screen goes once a language is chosen: the screen that sent the person here (with its own
 * state), else sign-in. `back`: opened from "Change" (a step forward in the history), so it goes back that step.
 */
type From = { next?: string; state?: unknown; back?: boolean } | null

/**
 * The very first screen on a phone where no language was ever chosen: one big button per language, each in its own
 * script with its English name under it. One tap downloads that language, keeps it as this phone's choice, and goes
 * on to sign-in, already in it. Also opened from "Language: … Change" on the sign-in screen. `note`: a line under
 * the question about where the person goes next (a salon's link opened).
 */
export function LanguageFirst({ note }: { note?: React.ReactNode } = {}) {
  const t = useT()
  const navigate = useNavigate()
  const from = (useLocation().state as From) ?? null
  const current = useLanguage()
  const [busy, setBusy] = useState<Lang | null>(null)
  const [failed, setFailed] = useState<Lang | null>(null)
  // The latest tap: a slower download from an earlier tap (or one finishing after this screen closed) does nothing
  const latest = useRef(0)
  useEffect(
    () => () => {
      latest.current = -1
    },
    [],
  )
  // Nothing chosen yet: the phone's own language first, marked, so the likeliest choice is the first button. Worked
  // out once, from the phone's setting (not from what is showing): the buttons never move under the finger when its
  // words finish downloading. Chosen before (came to change it): the chosen one is marked, in its place.
  const [guess] = useState<Lang | null>(() => {
    if (languageChosen()) return null
    const phone = browserLanguage()
    return phone && phone !== 'en' ? phone : null
  })
  const order = guess ? [...LANGUAGES.filter((l) => l.code === guess), ...LANGUAGES.filter((l) => l.code !== guess)] : LANGUAGES
  const marked = guess ?? (languageChosen() ? current : null)
  const ask = guess ?? current

  function leave() {
    if (from?.back) navigate(-1)
    else navigate(from?.next ?? '/signin', { replace: true, state: from?.state })
  }

  async function choose(lang: Lang) {
    if (busy === lang) return
    // Another tap while one downloads takes over (English needs no download: never stuck behind a slow one)
    const mine = ++latest.current
    setBusy(lang)
    setFailed(null)
    const ok = await setLanguage(lang)
    if (latest.current !== mine) return
    setBusy(null)
    if (!ok) {
      setFailed(lang)
      return
    }
    leave()
  }

  return (
    <Page>
      <Brand />
      <h1 className="text-center text-xl font-bold" lang={ask}>
        {ASK[ask]}
      </h1>
      {ask !== 'en' && (
        <p className="-mt-2 text-center text-sm text-muted" lang="en">
          {ASK.en}
        </p>
      )}
      {note}
      <div className="flex flex-col gap-3" role="group" aria-label={ASK[ask]}>
        {order.map((l) => (
          <button
            key={l.code}
            type="button"
            lang={l.code}
            // Both names, as shown (the English one under it is for someone helping)
            aria-label={l.code === 'en' ? l.name : `${l.name}, ${IN_ENGLISH[l.code]}`}
            aria-current={languageChosen() && l.code === current ? 'true' : undefined}
            onClick={() => void choose(l.code)}
            className={`flex min-h-16 items-center justify-between gap-3 rounded-2xl border px-5 py-3 text-left hover:bg-raised ${
              marked === l.code ? 'border-brand bg-brand/10' : 'border-line bg-surface'
            } ${busy === l.code ? 'opacity-60' : ''}`}
          >
            <span className="flex flex-col">
              <span className="text-xl font-semibold">{l.name}</span>
              {l.code !== 'en' && (
                <span className="text-xs text-muted" lang="en">
                  {IN_ENGLISH[l.code]}
                </span>
              )}
            </span>
            <span aria-hidden="true" className="text-2xl text-muted">
              {busy === l.code ? '…' : '›'}
            </span>
          </button>
        ))}
      </div>
      {/* Read out while a language downloads (the "…" on its button is only seen) */}
      <p role="status" className="sr-only">
        {busy ? `${LANGUAGES.find((l) => l.code === busy)?.name} …` : ''}
      </p>
      {failed && (
        <p role="alert" className="text-center text-sm text-bad">
          <span lang={failed}>{OFFLINE[failed]}</span>
          {failed !== 'en' && (
            <span className="mt-1 block" lang="en">
              {OFFLINE.en}
            </span>
          )}
        </p>
      )}
      {/* Came to change it: going back keeps the one already chosen */}
      {languageChosen() &&
        (from?.back ? (
          <button type="button" onClick={() => navigate(-1)} className="min-h-11 py-2 text-center text-sm text-link underline">
            {t('common.back')}
          </button>
        ) : (
          <Link to={from?.next ?? '/signin'} replace state={from?.state} className="py-2 text-center text-sm text-link underline">
            {t('common.back')}
          </Link>
        ))}
    </Page>
  )
}

/**
 * Sends someone to the language screen first when no language was ever chosen on this phone, then back here (with the
 * same notices: a deleted account, a salon's link).
 */
export function LanguageFirstGate({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  if (languageChosen()) return <>{children}</>
  return <Navigate to="/language" replace state={{ next: location.pathname + location.search, state: location.state }} />
}

/**
 * "Language: हिन्दी · बदलें (Change)", with a globe, on the sign-in screen: the chosen language, and the way to the
 * language screen (also worded in English, for someone helping who reads only English). `onLeave`: keeps what the
 * screen would lose (the number typed) before it closes.
 */
export function LanguageLine({ onLeave }: { onLeave?: () => void } = {}) {
  const t = useT()
  const location = useLocation()
  const current = useLanguage()
  const name = LANGUAGES.find((l) => l.code === current)?.name ?? current
  return (
    <p className="text-center text-sm text-muted">
      <GlobeIcon />
      <span>{t('language.shownIn')} </span>
      <span lang={current} className="font-semibold text-ink">
        {name}
      </span>
      {' · '}
      <Link
        to="/language"
        state={{ next: location.pathname + location.search, state: location.state, back: true }}
        onClick={(e) => {
          // Opened in another tab, this screen stays: nothing to keep for later
          if (!(e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0)) onLeave?.()
        }}
        className="inline-flex min-h-11 items-center text-link underline"
      >
        {t('language.change')}
        {current !== 'en' && <span lang="en">&nbsp;(Change)</span>}
      </Link>
    </p>
  )
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="mr-1 inline h-4 w-4 align-[-2px] text-link" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" />
    </svg>
  )
}
