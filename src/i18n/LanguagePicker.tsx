import { useState } from 'react'
import { LANGUAGES, setLanguage, useLanguage, useT, type Lang } from './index'
import { announceLanguageChosen } from './LanguageToast'

/**
 * The languages as buttons, each in its own script (so it can be found by someone who can't read the current one).
 * Changes the app at once; says so when a language couldn't be downloaded. {@code compact}: small buttons in a row that
 * wraps, for the top of a page that is about something else (the front page).
 */
export function LanguagePicker({
  onChosen,
  heading = false,
  compact = false,
}: {
  onChosen?: (lang: Lang) => void
  heading?: boolean
  compact?: boolean
}) {
  const t = useT()
  const current = useLanguage()
  const [busy, setBusy] = useState<Lang | null>(null)
  const [failed, setFailed] = useState(false)

  async function choose(lang: Lang) {
    setBusy(lang)
    setFailed(false)
    const ok = await setLanguage(lang)
    setBusy(null)
    if (ok) {
      announceLanguageChosen()
      onChosen?.(lang)
    } else setFailed(true)
  }

  return (
    <div>
      {heading && <p className={`mb-2 text-muted ${compact ? 'text-center text-xs' : 'text-sm'}`}>{t('language.choose')}</p>}
      <div
        className={compact ? 'grid grid-cols-3 gap-1.5' : 'grid grid-cols-3 gap-2'}
        role="group"
        aria-label={t('language.choose')}
      >
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            type="button"
            aria-pressed={current === l.code}
            aria-busy={busy === l.code}
            lang={l.code}
            onClick={() => busy === null && void choose(l.code)}
            className={`min-h-11 border text-sm font-medium ${compact ? 'rounded-full px-3 py-1' : 'rounded-xl px-2 py-2'} ${
              current === l.code ? 'border-brand bg-brand/10 text-link' : 'border-line bg-surface text-ink'
            } ${busy === l.code ? 'opacity-60' : ''}`}
          >
            {l.name}
          </button>
        ))}
      </div>
      {failed && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {t('language.offline')}
        </p>
      )}
    </div>
  )
}

/** A globe: the sign people know for "language", on the button that leads to the languages. */
export function GlobeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9M12 3C9.5 5.6 8.2 8.6 8.2 12s1.3 6.4 3.8 9" />
    </svg>
  )
}
