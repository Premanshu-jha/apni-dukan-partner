import { Component, type ReactNode } from 'react'
import { useT } from '../i18n'

/**
 * Last line of defence: an error while a screen draws shows this instead of a blank page. "Start again" reloads
 * the app at the day board.
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
    </div>
  )
}
