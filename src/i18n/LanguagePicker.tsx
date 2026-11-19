import { useState } from 'react'
import { LANGUAGES, setLanguage, useLanguage, useT, type Lang } from './index'

/**
 * The languages as buttons, each in its own script (so it can be found by someone who can't read the current one).
 * Changes the app at once; says so when a language couldn't be downloaded.
 */
export function LanguagePicker({ onChosen, heading = false }: { onChosen?: (lang: Lang) => void; heading?: boolean }) {
  const t = useT()
  const current = useLanguage()
  const [busy, setBusy] = useState<Lang | null>(null)
  const [failed, setFailed] = useState(false)

  async function choose(lang: Lang) {
    setBusy(lang)
    setFailed(false)
    const ok = await setLanguage(lang)
    setBusy(null)
    if (ok) onChosen?.(lang)
    else setFailed(true)
  }

  return (
    <div>
      {heading && <p className="mb-2 text-sm text-muted">{t('language.choose')}</p>}
      <div className="grid grid-cols-3 gap-2" role="group" aria-label={t('language.choose')}>
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            type="button"
            aria-pressed={current === l.code}
            aria-busy={busy === l.code}
            lang={l.code}
            onClick={() => busy === null && void choose(l.code)}
            className={`min-h-11 rounded-xl border px-2 py-2 text-sm font-medium ${
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
