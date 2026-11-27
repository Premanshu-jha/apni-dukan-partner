import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useShop } from '../api/shop'
import type { Refused } from '../app/guards'
import { Banner } from './ui'
import { useT } from '../i18n'
import { helpHref } from '../features/help/links'

/**
 * Why this person landed on their home screen (a salon's Today, a kirana's counter) instead of where they were going,
 * so a jump never looks like the app breaking: a screen their role can't open (the guard's `refused`: who can, and to
 * ask the owner), or a message with no screen of its own here (`aboutMessage`: what it was about). Said once: those
 * two leave the address's state (anything else in it stays), so a reload or Back doesn't bring it again.
 *
 * @param helpFrom where the note's Help comes back to (default: this screen)
 */
export function ArrivedNote({ helpFrom }: { helpFrom?: string } = {}) {
  const t = useT()
  const shop = useShop()
  const location = useLocation()
  const navigate = useNavigate()
  const [note] = useState(() => {
    const state = location.state as { refused?: unknown; aboutMessage?: unknown } | null
    return {
      refused: state?.refused === 'owner' || state?.refused === 'ownerHelper' ? (state.refused as Refused) : null,
      about: typeof state?.aboutMessage === 'string' && state.aboutMessage ? state.aboutMessage.slice(0, 200) : null,
    }
  })
  const [open, setOpen] = useState(true)
  // Taken out of the address once, as Today opens (only this note's state, never a later screen's)
  const [cleared, setCleared] = useState(false)
  const hasNote = Boolean(note.refused || note.about)
  useEffect(() => {
    if (!hasNote || cleared) return
    setCleared(true)
    const rest: Record<string, unknown> = { ...(location.state as Record<string, unknown> | null) }
    delete rest.refused
    delete rest.aboutMessage
    navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: Object.keys(rest).length ? rest : null })
  }, [hasNote, cleared, location.pathname, location.search, location.state, navigate])
  if (!open || (!note.refused && !note.about)) return null
  return (
    <Banner tone="info">
      <p>
        {note.refused
          ? t(note.refused === 'owner' ? 'day.refusedOwner' : 'day.refusedOwnerHelper', { ownerName: shop.ownerName })
          : t('notifications.aboutMessage', { title: note.about! })}
      </p>
      <div className="mt-1 flex flex-wrap gap-x-4">
        {note.refused && (
          <Link to={helpHref({ from: helpFrom ?? location.pathname + location.search })} className="inline-flex min-h-11 items-center text-link underline">
            {t('help.button')}
          </Link>
        )}
        <button type="button" className="min-h-11 text-link underline" onClick={() => setOpen(false)}>
          {t('common.close')}
        </button>
      </div>
    </Banner>
  )
}
