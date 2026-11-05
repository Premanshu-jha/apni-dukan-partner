import { Button } from './ui'
import { platform } from '../lib/device'

/** Shown when the browser has blocked location for this site: how to turn it on, for the person's phone. */
export function LocationGuide({ onRetry }: { onRetry: () => void }) {
  const p = platform()
  const steps =
    p === 'ios'
      ? [
          'Open the Settings app on your iPhone.',
          'Tap Privacy & Security, then Location Services, and make sure it is on.',
          'Scroll down to Safari Websites (or your browser) and choose "While Using the App".',
          'Come back here and reload the page, then tap Try again.',
        ]
      : p === 'android'
        ? [
            'Tap the icon at the left of the address bar (a lock or two sliders).',
            'Tap Permissions, then Location, and choose Allow.',
            'Check that Location is on in your phone’s quick settings (swipe down from the top).',
            'Come back here and tap Try again.',
          ]
        : [
            'Click the icon at the left of the address bar.',
            'Find Location and set it to Allow.',
            'Reload the page and click Try again.',
            'A computer can only guess where it is: register from your phone, standing in the salon.',
          ]
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="font-semibold">Location is turned off</p>
        <p className="text-sm text-muted">Customers find your salon by its location. Here's how to turn it on:</p>
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
        Try again
      </Button>
    </div>
  )
}
