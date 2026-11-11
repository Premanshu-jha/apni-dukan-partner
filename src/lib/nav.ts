import type { NavigateFunction } from 'react-router'

/** How many app screens are behind this one in the tab's history (react-router keeps the index). */
export function screensBehind(): number {
  const idx = (window.history.state as { idx?: number } | null)?.idx
  return typeof idx === 'number' ? idx : 0
}

/**
 * Back to the screen that opened this one (so the phone's Back doesn't loop through the screens again), or, opened
 * straight from a link, on to `fallback` in its place.
 */
export function goBack(navigate: NavigateFunction, fallback: string, steps = 1): void {
  if (screensBehind() >= steps) void navigate(-steps)
  else void navigate(fallback, { replace: true })
}
