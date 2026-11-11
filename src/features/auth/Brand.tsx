import { Logo } from '../../components/Logo'

/** The sign-in screens' header: the Clozest logo with the app's name under it, and a line about what the app is for. */
export function Brand({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 pt-8 pb-4 text-center">
      <p className="h-14">
        <Logo name="Clozest Partner" className="h-full" />
      </p>
      <p aria-hidden="true" className="-mt-1 font-display text-sm font-semibold tracking-[0.3em] text-accent uppercase">Partner</p>
      {subtitle && <p className="max-w-xs text-muted">{subtitle}</p>}
    </div>
  )
}
