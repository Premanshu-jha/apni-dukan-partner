import { createContext, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type Ref, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate } from 'react-router'
import { HelpButton, SheetHelpLink } from '../features/help/HelpButton'
import { helpHref, shopKindHere, topicFor } from '../features/help/links'
import { ShopContext } from '../api/shop'
import { LANGUAGES, useLanguage, useT } from '../i18n'
import { GlobeIcon, LanguagePicker } from '../i18n/LanguagePicker'
import { useSession } from '../store/session'
import { SheetContext, type SheetState } from './sheetState'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const variants: Record<Variant, string> = {
  primary: 'bg-brand bg-linear-to-br from-brand to-brand-deep text-brand-ink font-semibold shadow-lg shadow-brand/25 hover:brightness-110',
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
  ref,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean; ref?: Ref<HTMLButtonElement> }) {
  return (
    <button
      ref={ref}
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

export function Card({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  return <div id={id} className={`rounded-2xl border border-line bg-surface p-4 ${className}`}>{children}</div>
}

export function Spinner({ small = false, label }: { small?: boolean; label?: string }) {
  const t = useT()
  const size = small ? 'h-4 w-4 border-2' : 'h-8 w-8 border-[3px]'
  return (
    <span role="status" className="inline-flex items-center gap-3">
      <span className={`${size} animate-spin rounded-full border-muted/30 border-t-brand`} aria-hidden />
      <span className={label ? 'text-muted' : 'sr-only'}>{label ?? t('ui.spinnerLoading')}</span>
    </span>
  )
}

export function Loading({ label }: { label?: string }) {
  const t = useT()
  return (
    <div className="flex min-h-40 items-center justify-center">
      <Spinner label={label ?? t('common.loading')} />
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

/** @param live false inside a region that already announces (aria-live), so it isn't announced twice */
export function Banner({ tone = 'info', live = true, children }: { tone?: Tone; live?: boolean; children: ReactNode }) {
  return (
    <div role={live ? (tone === 'bad' ? 'alert' : 'status') : undefined} className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>
      {children}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useT()
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <p className="text-muted">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
      <ErrorSupportLink message={message} />
    </div>
  )
}

/**
 * Under every shared error: support, one tap away, with the error already in the message (and the screen as the
 * subject), so nobody has to describe it. Signed out or without a verified email, the help page still opens: it
 * offers Call us and WhatsApp us, and says why writing needs an email.
 */
export function ErrorSupportLink({ message, about }: { message: string; about?: string }) {
  const t = useT()
  const location = useLocation()
  const shop = useContext(ShopContext)
  const userId = useSession((s) => s.user?.id)
  const kind = shopKindHere(location.pathname, shop?.type, userId)
  const to = helpHref({
    from: location.pathname + location.search,
    about: about ?? topicFor(location.pathname, kind) ?? t('help.topicError'),
    text: t('help.errorText', { message }),
    write: true,
  })
  return (
    <p className="text-sm text-muted">
      {t('help.stillNotWorking')}{' '}
      <Link to={to} className="inline-flex min-h-11 items-center text-link underline">
        {t('help.writeToUs')}
      </Link>
    </p>
  )
}

/**
 * A save or a send that failed: the red line, and under it "Still not working? Write to us" with the words it said
 * already in the message (the full-page ErrorState has the same).
 */
export function ErrorBanner({ message, about }: { message: string; about?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <Banner tone="bad">{message}</Banner>
      <ErrorSupportLink message={message} about={about} />
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

/**
 * The globe and the language showing (in its own script): opens the languages in a sheet. For screens where More, and
 * its language card, can't be opened yet (sign-up, registration, the wait for approval, the start).
 */
export function LanguageButton({ className = '', stacked = false }: { className?: string; stacked?: boolean }) {
  const t = useT()
  const lang = useLanguage()
  const [open, setOpen] = useState(false)
  const name = LANGUAGES.find((l) => l.code === lang)?.name ?? lang
  return (
    <>
      <button
        type="button"
        aria-label={t('language.button', { name })}
        onClick={() => setOpen(true)}
        className={
          stacked
            ? // The globe with the name under it, like a tab: narrow enough for a crowded header on a 360px phone
              `inline-flex min-h-11 min-w-11 shrink-0 flex-col items-center justify-center rounded-xl px-1.5 text-link hover:bg-raised ${className}`
            : `inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-line px-3 text-sm text-link hover:bg-raised ${className}`
        }
      >
        <GlobeIcon size={stacked ? 18 : undefined} />
        <span lang={lang} className={stacked ? 'text-[11px] leading-tight' : undefined}>
          {name}
        </span>
      </button>
      {/* Out of the header: its backdrop blur would hold a fixed panel inside it */}
      {open &&
        createPortal(
          <Sheet open title={t('language.title')} onClose={() => setOpen(false)} help={false}>
            <LanguagePicker onChosen={() => setOpen(false)} />
          </Sheet>,
          document.body,
        )}
    </>
  )
}

/** Set by a layout (registration) whose every screen shows the language beside Help. */
export const LanguageInHeader = createContext(false)

/**
 * A screen with a title bar; `back` shows a back arrow. Every screen gets Help at the top right (HelpButton: not on
 * the help pages, nor a kirana's); a screen without a title bar (Today, sign-in, Start) gets it in a slim row above
 * its own top line, so it never sits on the screen's own buttons (Today's bell).
 */
export function Page({
  title,
  back,
  backReplace,
  children,
  footer,
  leaveWarning,
  helpTopic,
  ownHelp = false,
  language = false,
}: {
  title?: string
  back?: boolean | string
  /** With a string `back`: go there in place of this screen (no history entry), so Back can't loop */
  backReplace?: boolean
  children: ReactNode
  footer?: ReactNode
  /** When set, the back button asks first (e.g. an upload under way). Help asks the same. */
  leaveWarning?: string | null
  /** What a question from this screen is about, when its address alone doesn't say enough (links.ts topicFor) */
  helpTopic?: string
  /** The screen draws Help itself, in its own header (Today, next to its bell), so Page adds none */
  ownHelp?: boolean
  /** The language, one tap away beside Help: screens where More (and its language card) can't be opened yet */
  language?: boolean
}) {
  const t = useT()
  const navigate = useNavigate()
  const withLanguage = useContext(LanguageInHeader) || language
  return (
    <div className="flex flex-1 flex-col">
      {!(title || back) && !ownHelp && (
        <div className="-mb-3 flex justify-end gap-2 px-4 pt-3 empty:hidden">
          {withLanguage && <LanguageButton />}
          <HelpButton topic={helpTopic} leaveWarning={leaveWarning} />
        </div>
      )}
      {(title || back) && (
        <header className="sticky top-0 z-10 flex min-h-14 items-center gap-2 border-b border-line bg-bg/95 px-2 backdrop-blur">
          {back && (
            <button
              type="button"
              aria-label={t('common.back')}
              onClick={() => {
                if (leaveWarning && !window.confirm(leaveWarning)) return
                if (typeof back === 'string') navigate(back, { replace: backReplace })
                else navigate(-1)
              }}
              className="flex h-11 w-11 items-center justify-center rounded-full text-xl hover:bg-raised"
            >
              ←
            </button>
          )}
          {/* Takes the room left beside Help and wraps (a long salon name on a 360px phone) instead of pushing it off */}
          {title && <h1 className={`min-w-0 flex-1 font-display text-lg font-semibold break-words ${back ? '' : 'px-2'}`}>{title}</h1>}
          {withLanguage ? (
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <LanguageButton />
              <HelpButton topic={helpTopic} leaveWarning={leaveWarning} />
            </div>
          ) : (
            <HelpButton topic={helpTopic} leaveWarning={leaveWarning} />
          )}
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

type FormField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
function fields(root: HTMLElement | null): FormField[] {
  return Array.from(root?.querySelectorAll<FormField>('input, textarea, select') ?? []).filter(
    (el) => !(el instanceof HTMLInputElement && (el.type === 'hidden' || el.type === 'file')),
  )
}
function fieldValue(el: FormField): string {
  return el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio') ? String(el.checked) : el.value
}
/** A field that appeared after the sheet opened (a later step): changed when it holds anything */
function emptyValue(el: FormField): string {
  return el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio') ? 'false' : ''
}

/**
 * A panel that slides up over the screen, for confirmations. It covers the screen's own Help, so it has Help in its
 * own header (about this screen, and back here after); a sheet with a form gives its own (`help`, asking first when
 * something is typed), and `help={false}` leaves it out.
 */
export function Sheet({
  open,
  title,
  onClose,
  children,
  help,
  busy = false,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  help?: ReactNode | false
  /** Something on its way (a save, a leave): no Help then (leaving would cut it off) */
  busy?: boolean
}) {
  const panel = useRef<HTMLDivElement>(null)
  // What each field held when the sheet opened: Help asks first when any differs (typing is never lost unasked)
  const initial = useRef(new WeakMap<Element, string>())
  const sheetState = useRef<SheetState>({
    typed: () => fields(panel.current).some((el) => fieldValue(el) !== (initial.current.get(el) ?? emptyValue(el))),
    busy: () => Boolean(panel.current?.querySelector('[aria-busy="true"], button:disabled [role="status"]')),
  })
  // The latest onClose, so a parent re-render (a new inline function) doesn't re-run the focus handling
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  }, [onClose])
  useEffect(() => {
    if (!open) return
    for (const el of fields(panel.current)) initial.current.set(el, fieldValue(el))
    const before = document.activeElement as HTMLElement | null
    const focusable = () =>
      Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, textarea, [tabindex="0"]') ?? [])
    // The first action, not the Help in the header
    const first = focusable().find((el) => !el.closest('[data-sheet-help]')) ?? focusable()[0]
    first?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current()
      if (e.key !== 'Tab') return
      const list = focusable()
      // Nothing to move to (every button busy): Tab stays in the sheet rather than going to the page behind it
      if (!list.length) {
        e.preventDefault()
        return
      }
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
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-scrim/60" onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-t-3xl border-t border-line bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <SheetContext.Provider value={sheetState.current}>
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 className="min-w-0 font-display text-lg font-semibold break-words">{title}</h2>
          {help !== false && !busy && <span data-sheet-help className="max-w-[55%] shrink-0">{help ?? <SheetHelpLink dirty={false} />}</span>}
        </div>
        {children}
        </SheetContext.Provider>
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
  brand: 'bg-brand/15 text-link',
  good: 'bg-good/15 text-good',
  warn: 'bg-warn/15 text-warn',
  bad: 'bg-bad/15 text-bad',
  muted: 'bg-raised text-muted',
} as const

export function Pill({ tone, wrap = false, children }: { tone: keyof typeof pillTones; wrap?: boolean; children: ReactNode }) {
  // Never wraps or shrinks: the name beside it wraps instead (status words stay whole in every language). A long pill
  // (a phone number, a few words in Tamil or Kannada) may take a second line instead of pushing out of a 360px phone.
  const fit = wrap ? 'min-w-0 whitespace-normal text-center [overflow-wrap:anywhere]' : 'shrink-0 whitespace-nowrap'
  return <span className={`inline-flex ${fit} rounded-full px-2.5 py-0.5 text-xs font-semibold ${pillTones[tone]}`}>{children}</span>
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
