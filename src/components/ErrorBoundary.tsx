import { Component, type ReactNode } from 'react'

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
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-semibold">Something went wrong on this screen</p>
        <p className="text-muted">Your salon's data is safe. Start again to carry on.</p>
        <button
          type="button"
          className="min-h-12 rounded-xl bg-brand px-5 font-semibold text-brand-ink"
          onClick={() => window.location.assign('/')}
        >
          Start again
        </button>
      </div>
    )
  }
}
