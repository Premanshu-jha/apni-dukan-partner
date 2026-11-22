import { useNavigate } from 'react-router'
import { useT } from '../../i18n'
import { useSetupState } from './useSetupState'

/**
 * On the Salon tab, once Today's "Get your salon ready" card is gone (everything else done): the good-to-do steps this
 * account skipped and still hasn't done, with Show, which brings them back and opens Today where the card is. Nothing
 * while the card is still on Today (it has its own "Show them"), or with nothing skipped.
 */
export function SkippedStepsRow() {
  const t = useT()
  const navigate = useNavigate()
  const { waiting, failed, next, skipped, showSkipped } = useSetupState()
  if (waiting || failed || next !== null || skipped.length === 0) return null
  return (
    <button
      type="button"
      onClick={() => {
        showSkipped(skipped)
        navigate('/salon/day')
      }}
      className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4 text-left hover:bg-raised"
    >
      <span className="font-medium">{t('guide.skippedRow', { count: skipped.length })}</span>
      <span className="shrink-0 text-link underline">{t('guide.skippedShow')}</span>
    </button>
  )
}
