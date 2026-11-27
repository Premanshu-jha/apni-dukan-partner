import { Component, type ReactNode } from 'react'
import { helpHref } from '../features/help/links'
import { useT } from '../i18n'
import { ContactUs } from './ContactUs'

/**
 * Last line of defence: an error while a screen draws shows this instead of a blank page. "Start again" reloads
 * the app at the day board. If that screen is the one that breaks, there is still a way on: More (help, language,
 * sign out), "Write to us" with what happened filled in, and Call us / WhatsApp us. Plain links, each a fresh page
 * load (the screens that broke are left behind), and none needs the router.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <Failed />
  }
}

/** What the boundary shows (a component of its own: a class can't use the language hook). */
function Failed() {
  const t = useT()
  const path = window.location.pathname
  const write = helpHref({
    write: true,
    about: t('help.topicError'),
    text: t('help.crashText', { message: t('ui.errorTitle'), path }),
  })
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-lg font-semibold">{t('ui.errorTitle')}</p>
      <p className="text-muted">{t('ui.errorBody')}</p>
      <button
        type="button"
        className="min-h-12 rounded-xl bg-brand px-5 font-semibold text-brand-ink"
        onClick={() => window.location.assign('/')}
      >
        {t('ui.errorStartAgain')}
      </button>
      <a href="/more" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line px-5 font-semibold">
        {t('ui.errorOpenMore')}
      </a>
      <p className="text-sm text-muted">
        {t('help.stillNotWorking')}{' '}
        <a href={write} className="inline-flex min-h-11 items-center text-link underline">
          {t('help.writeToUs')}
        </a>
      </p>
      <div className="w-full">
        <ContactUs screen={path} />
      </div>
    </div>
  )
}
