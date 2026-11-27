import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ContactUs } from '../../components/ContactUs'
import { useT } from '../../i18n'
import { signOutHere } from '../profile/signOut'

/**
 * Under the sign-up steps (email, name): never a dead end. Someone with no email, or whose code doesn't come, can call
 * or WhatsApp us; someone on the wrong number, or on another person's phone, signs out and starts again.
 */
export function SignUpWayOut({ screen }: { screen: string }) {
  const t = useT()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  return (
    <div className="mt-2 flex flex-col gap-4 border-t border-line pt-4">
      <ContactUs screen={screen} heading={t('auth.noEmailCallUs')} />
      <button
        type="button"
        disabled={busy}
        className="min-h-11 text-center text-sm text-link underline disabled:opacity-50"
        onClick={() => {
          setBusy(true)
          // Never stuck disabled: a sign-out that failed (push couldn't be turned off) can be tapped again
          void signOutHere(qc)
            .then(() => navigate('/signin', { replace: true }))
            .catch(() => setBusy(false))
        }}
      >
        {t('auth.wrongNumberStartAgain')}
      </button>
    </div>
  )
}
