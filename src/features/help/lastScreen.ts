import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { isHelpPage } from './links'

/**
 * The screen this person was on before More (kept in memory only, for this tab): More's "Write to support" is then
 * about it ("Counter", "Today"), not about More, so the request says what they were doing.
 */
let last: string | null = null

export function lastScreen(): string | null {
  return last
}

/** Layouts call this: every screen but More and the help pages is noted as it opens. */
export function useNoteScreen() {
  const { pathname } = useLocation()
  useEffect(() => {
    if (pathname !== '/more' && !isHelpPage(pathname)) last = pathname
  }, [pathname])
}

/** For tests. */
export function forgetLastScreen() {
  last = null
}
