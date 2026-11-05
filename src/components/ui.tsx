import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { useNavigate } from 'react-router'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-brand-ink font-semibold hover:brightness-110',
  secondary: 'bg-raised text-ink border border-line hover:bg-line',
  danger: 'bg-bad/15 text-bad border border-bad/40 hover:bg-bad/25',
  ghost: 'text-ink hover:bg-raised',
}

export function Button({
  variant = 'primary',
  busy = false,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-base transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    >
      {busy && <Spinner small />}
      {children}
    </button>
  )
}

export function Field({
  label,
  hint,
  error,
  id,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string; id: string }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-muted">
        {label}
      </label>
      <input
        id={id}
        {...rest}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={`min-h-12 rounded-xl border bg-surface px-4 text-base text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none ${error ? 'border-bad' : 'border-line'}`}
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-bad">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-surface p-4 ${className}`}>{children}</div>
}

export function Spinner({ small = false, label }: { small?: boolean; label?: string }) {
  const size = small ? 'h-4 w-4 border-2' : 'h-8 w-8 border-[3px]'
  return (
    <span role="status" className="inline-flex items-center gap-3">
      <span className={`${size} animate-spin rounded-full border-muted/30 border-t-brand`} aria-hidden />
      <span className={label ? 'text-muted' : 'sr-only'}>{label ?? 'Loading'}</span>
    </span>
  )
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center">
      <Spinner label={label} />
    </div>
  )
}

type Tone = 'info' | 'good' | 'warn' | 'bad'
const tones: Record<Tone, string> = {
  info: 'border-line bg-raised text-ink',
  good: 'border-good/40 bg-good/10 text-good',
  warn: 'border-warn/40 bg-warn/10 text-warn',
  bad: 'border-bad/40 bg-bad/10 text-bad',
}

export function Banner({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>
      {children}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <p className="text-muted">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <p className="text-lg font-semibold">{title}</p>
      {body && <p className="max-w-xs text-muted">{body}</p>}
      {action}
    </div>
  )
}

/** A screen with a title bar; `back` shows a back arrow. */
export function Page({
  title,
  back,
  children,
  footer,
}: {
  title?: string
  back?: boolean | string
  children: ReactNode
  footer?: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <div className="flex flex-1 flex-col">
      {(title || back) && (
        <header className="sticky top-0 z-10 flex min-h-14 items-center gap-2 border-b border-line bg-bg/95 px-2 backdrop-blur">
          {back && (
            <button
              type="button"
              aria-label="Back"
              onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
              className="flex h-11 w-11 items-center justify-center rounded-full text-xl hover:bg-raised"
            >
              ←
            </button>
          )}
          {title && <h1 className={`text-lg font-semibold ${back ? '' : 'px-2'}`}>{title}</h1>}
        </header>
      )}
      <main className="flex flex-1 flex-col gap-4 px-4 py-4">{children}</main>
      {footer && (
        <div className="sticky bottom-0 border-t border-line bg-bg/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
          {footer}
        </div>
      )}
    </div>
  )
}

/** A panel that slides up over the screen, for confirmations. */
export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  // The latest onClose, so a parent re-render (a new inline function) doesn't re-run the focus handling
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  }, [onClose])
  useEffect(() => {
    if (!open) return
    const before = document.activeElement as HTMLElement | null
    const focusable = () =>
      Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, textarea, [tabindex="0"]') ?? [])
    focusable()[0]?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current()
      if (e.key !== 'Tab') return
      const list = focusable()
      if (!list.length) return
      const first = list[0]
      const last = list[list.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      before?.focus()
    }
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-t-3xl border-t border-line bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <h2 className="mb-3 text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  )
}

export function Chip({
  selected,
  children,
  onClick,
  disabled,
}: {
  selected: boolean
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`min-h-11 shrink-0 rounded-xl border px-4 text-sm transition disabled:opacity-40 ${selected ? 'border-brand bg-brand text-brand-ink font-semibold' : 'border-line bg-surface text-ink hover:bg-raised'}`}
    >
      {children}
    </button>
  )
}

export function TextArea({
  label,
  hint,
  error,
  id,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string; error?: string; id: string }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-muted">
        {label}
      </label>
      <textarea
        id={id}
        rows={3}
        {...rest}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={`rounded-xl border bg-surface px-4 py-3 text-base text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none ${error ? 'border-bad' : 'border-line'}`}
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-bad">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

const pillTones = {
  brand: 'bg-brand/15 text-brand',
  good: 'bg-good/15 text-good',
  warn: 'bg-warn/15 text-warn',
  bad: 'bg-bad/15 text-bad',
  muted: 'bg-raised text-muted',
} as const

export function Pill({ tone, children }: { tone: keyof typeof pillTones; children: ReactNode }) {
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${pillTones[tone]}`}>{children}</span>
}

/** An on/off switch with a visible label. */
export function Switch({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string
  checked: boolean
  onChange: (on: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-8 w-14 shrink-0 rounded-full transition ${checked ? 'bg-brand' : 'bg-line'} disabled:opacity-50`}
    >
      <span className={`absolute top-1 h-6 w-6 rounded-full bg-ink transition ${checked ? 'left-7' : 'left-1'}`} />
    </button>
  )
}
