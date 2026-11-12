import { useState } from 'react'

/** A small "Copy" next to a code (the shop code, to quote to support), saying "Copied" for a moment. */
export function CopyCode({ code }: { code: string }) {
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
    <button type="button" className="text-link underline" aria-label={`Copy shop code ${code}`} onClick={() => void copy()}>
      <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  )
}
