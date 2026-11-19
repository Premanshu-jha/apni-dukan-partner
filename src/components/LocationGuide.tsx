import { Button } from './ui'
import { useT } from '../i18n'
import { platform } from '../lib/device'

/** Shown when the browser has blocked location for this site: how to turn it on, for the person's phone. */
export function LocationGuide({ onRetry }: { onRetry: () => void }) {
  const t = useT()
  const p = platform()
  const steps =
    p === 'ios'
      ? [
          t('ui.locationIosSettings'),
          t('ui.locationIosServices'),
          t('ui.locationIosBrowser'),
          t('ui.locationIosReturn'),
        ]
      : p === 'android'
        ? [
            t('ui.locationAndroidIcon'),
            t('ui.locationAndroidAllow'),
            t('ui.locationAndroidQuickSettings'),
            t('ui.locationAndroidReturn'),
          ]
        : [
            t('ui.locationDesktopIcon'),
            t('ui.locationDesktopAllow'),
            t('ui.locationDesktopReload'),
            t('ui.locationDesktopUsePhone'),
          ]
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="font-semibold">{t('ui.locationOffTitle')}</p>
        <p className="text-sm text-muted">{t('ui.locationOffBody')}</p>
      </div>
      <ol className="flex flex-col gap-2">
        {steps.map((s, i) => (
          <li key={s} className="flex gap-3 rounded-xl border border-line bg-raised p-3 text-sm">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-brand-ink">
              {i + 1}
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      <Button variant="secondary" onClick={onRetry}>
        {t('common.retry')}
      </Button>
    </div>
  )
}
