import { Component, type ReactNode } from 'react'

/**
 * Around a lazily loaded map: if its code can't be fetched (offline, or a tab opened before a deploy whose files are
 * gone), the page stays and this says so, instead of the whole screen failing.
 */
export class MapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return (
        <p role="status" className="rounded-xl border border-line bg-surface p-3 text-sm text-muted">
          The map couldn't load (no internet?). Reload the page to try again.
        </p>
      )
    }
    return this.props.children
  }
}
