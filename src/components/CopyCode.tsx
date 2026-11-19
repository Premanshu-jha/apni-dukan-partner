import { useState } from 'react'
import { useT } from '../i18n'

/** A small "Copy" next to a code (the shop code, to quote to support), saying "Copied" for a moment. */
export function CopyCode({ code }: { code: string }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // No clipboard (an old browser, or not allowed): the code is right there to read
    }
  }
  return (
    <button type="button" className="text-link underline" aria-label={t('ui.copyCodeAria', { code })} onClick={() => void copy()}>
      <span aria-live="polite">{copied ? t('ui.copyCopied') : t('ui.copyCopy')}</span>
    </button>
  )
}
