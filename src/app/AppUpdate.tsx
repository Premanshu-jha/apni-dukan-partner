import { useEffect, useState, type ReactNode } from 'react'
import { useT } from '../i18n'
import { UpdateHelp } from './UpdateWebView'
import {
  check,
  finishPlayUpdate,
  markScreensWorking,
  laterForFix,
  laterForPlay,
  playUpdateLater,
  startPlayUpdate,
  switchNow,
  updateFromPlay,
  useAppUpdate,
} from '../lib/appUpdates'

/**
 * The Play Store app's own updates (lib/appUpdates.ts; nothing on the website). Too old to use: only the "Please
 * update" screen. A newer version on Google Play: a banner above the screen (in the page, so it never covers a
 * screen's title or Back), which can be put off until the next start. A fix the super admin marked urgent, once it
 * is downloaded: "A fix is ready" with Restart (the app reloads into it on this same screen) and Later; it never
 * covers the screen, so nobody is cut off in the middle of a booking. Once this is drawn, the screens are marked as
 * working (a screen update that never gets this far goes back to the previous screens by itself).
 */
export function AppUpdateGate({ children }: { children: ReactNode }) {
  const { required, urgent, switching } = useAppUpdate()
  useEffect(() => markScreensWorking(), [])
  if (required) return <UpdateRequired />
  return (
    <>
      {switching && <Switching />}
      {/* One banner at a time: an urgent fix first (Google's install can wait until it is done) */}
      {urgent ? <FixReadyBanner /> : <PlayUpdateBanner />}
      {children}
    </>
  )
}

function UpdateRequired() {
  const t = useT()
  const [checking, setChecking] = useState(false)
  async function again() {
    setChecking(true)
    await check()
    setChecking(false)
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6 text-center">
      <h1 className="font-display text-2xl font-bold">{t('app.updateRequiredTitle')}</h1>
      <p className="text-muted">{t('app.updateRequiredBody')}</p>
      <button
        type="button"
        className="inline-flex min-h-12 items-center justify-center rounded-xl bg-brand px-5 font-semibold text-brand-ink"
        onClick={() => void updateFromPlay()}
      >
        {t('app.updateRequiredButton')}
      </button>
      <p className="text-sm text-muted">{t('app.updateRequiredHint')}</p>
      <button
        type="button"
        className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line px-5 font-semibold disabled:opacity-60"
        disabled={checking}
        onClick={() => void again()}
      >
        {checking ? t('app.updateRequiredChecking') : t('app.updateRequiredCheck')}
      </button>
      <UpdateHelp screen={t('app.updateRequiredTitle')} />
    </main>
  )
}

/** While the app reloads into new screens: nothing to tap for a second or two. */
function Switching() {
  const t = useT()
  return (
    <div role="status" className="fixed inset-0 z-50 flex items-center justify-center bg-bg/95 p-6 text-center">
      <p className="font-semibold">{t('app.switching')}</p>
    </div>
  )
}

function FixReadyBanner() {
  const t = useT()
  const [restarting, setRestarting] = useState(false)
  return (
    <div className="border-b border-line bg-raised pt-[env(safe-area-inset-top)]">
      <div role="status" className="mx-auto flex max-w-lg flex-wrap items-center justify-between gap-2 px-4 py-2">
        <p className="min-w-0 flex-1 text-sm">{t('app.fixReady')}</p>
        <div className="flex shrink-0 gap-2">
          <button type="button" className="min-h-10 rounded-xl px-3 text-sm text-muted" onClick={() => laterForFix()}>
            {t('app.playUpdateLater')}
          </button>
          <button
            type="button"
            className="min-h-10 rounded-xl bg-brand px-4 font-semibold text-brand-ink disabled:opacity-60"
            disabled={restarting}
            onClick={() => {
              setRestarting(true)
              // Nothing to switch to any more (pulled back meanwhile): the banner goes by itself
              void switchNow().finally(() => setRestarting(false))
            }}
          >
            {t('app.playUpdateRestart')}
          </button>
        </div>
      </div>
    </div>
  )
}

function PlayUpdateBanner() {
  const t = useT()
  const { play } = useAppUpdate()
  // Later is kept outside this banner: an urgent fix's banner shown meanwhile doesn't bring it back
  if (play === 'none' || playUpdateLater()) return null
  return (
    <div className="border-b border-line bg-raised pt-[env(safe-area-inset-top)]">
      <div role="status" className="mx-auto flex max-w-lg flex-wrap items-center justify-between gap-2 px-4 py-2">
        <p className="min-w-0 flex-1 text-sm">
          {play === 'ready'
            ? t('app.playUpdateReady')
            : play === 'downloading'
              ? t('app.playUpdateDownloading')
              : t('app.playUpdateAvailable')}
        </p>
        <div className="flex shrink-0 gap-2">
          <button type="button" className="min-h-10 rounded-xl px-3 text-sm text-muted" onClick={() => laterForPlay()}>
            {t('app.playUpdateLater')}
          </button>
          {play === 'available' && (
            <button
              type="button"
              className="min-h-10 rounded-xl bg-brand px-4 font-semibold text-brand-ink"
              onClick={() => void startPlayUpdate()}
            >
              {t('app.playUpdateButton')}
            </button>
          )}
          {play === 'ready' && (
            <button
              type="button"
              className="min-h-10 rounded-xl bg-brand px-4 font-semibold text-brand-ink"
              onClick={() => void finishPlayUpdate()}
            >
              {t('app.playUpdateRestart')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
