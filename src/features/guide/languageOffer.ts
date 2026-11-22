import { create } from 'zustand'

/**
 * Whether the language offer (Shell's "Use the app in your language", six buttons at the top of every tab) is open.
 * Today counts it as its first guide card: while it is open, no tips and no setup card, so a first open on a small
 * phone still shows the board's own buttons. Shell sets it; nothing else does.
 */
export const useLanguageOffer = create<{ open: boolean }>(() => ({ open: false }))
