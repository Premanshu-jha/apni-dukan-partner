import { useCallback, useEffect, useState } from 'react'
import { t } from '../i18n'

/**
 * Leaving a screen with changes not saved yet (Back, or Help at the top right): Page's `leaveWarning` asks first with
 * this one plain sentence, so a tap on Help in the middle of an edit never throws the edit away. Null: nothing to lose.
 */
export function unsavedWarning(dirty: boolean): string | null {
  return dirty ? t('help.leaveUnsaved') : null
}

/**
 * A screen made of several small forms, each with its own Save (a barber's name, sign-in phone, services and
 * hours): each part says whether it holds changes, and the screen asks before leaving while any does.
 */
export function useUnsavedParts(): [boolean, (part: string, dirty: boolean) => void] {
  const [parts, setParts] = useState<Record<string, boolean>>({})
  const report = useCallback((part: string, dirty: boolean) => {
    setParts((now) => (Boolean(now[part]) === dirty ? now : { ...now, [part]: dirty }))
  }, [])
  return [Object.values(parts).some(Boolean), report]
}

/** One part's state, told to the screen (and taken back when the part goes). */
export function useReportUnsaved(report: ((part: string, dirty: boolean) => void) | undefined, part: string, dirty: boolean): void {
  useEffect(() => {
    report?.(part, dirty)
  }, [report, part, dirty])
  useEffect(() => () => report?.(part, false), [report, part])
}
