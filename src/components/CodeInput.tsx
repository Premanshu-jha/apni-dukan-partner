import { useEffect, useRef } from 'react'

/** One box for an SMS or email code: numbers only, fills from the phone's "paste code" suggestion. */
export function CodeInput({
  id,
  value,
  onChange,
  length = 6,
  label,
  error,
  autoFocus = true,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  length?: number
  label: string
  error?: string
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-muted">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={length}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, length))}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`min-h-14 rounded-xl border bg-surface px-4 text-center text-2xl tracking-[0.5em] text-ink focus:border-brand focus:outline-none ${error ? 'border-bad' : 'border-line'}`}
      />
      {error && (
        <p id={`${id}-error`} className="text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  )
}
