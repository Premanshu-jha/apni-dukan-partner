import { useState } from 'react'
import { useNavigate } from 'react-router'
import { authApi } from '../../api/auth'
import { fieldError, messageOf } from '../../api/errors'
import { Banner, Button, Field, Page } from '../../components/ui'
import { useSession } from '../../store/session'
import { nextAfterSignIn } from './flow'

/** Sign-up step 3, asked last: the name the salon's owner and our field team see. */
export function NameStep() {
  const navigate = useNavigate()
  const setUser = useSession((s) => s.setUser)
  const [name, setName] = useState(useSession.getState().user?.name ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const trimmed = name.trim()
  const valid = trimmed.length >= 2 && trimmed.length <= 60

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    setBusy(true)
    setError(null)
    try {
      const user = await authApi.rename(trimmed)
      setUser(user)
      navigate(nextAfterSignIn(user), { replace: true })
    } catch (err) {
      setError(fieldError(err, 'name') ?? messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page title="What should we call you?">
      <p className="text-muted">Step 3 of 3. Your owner and our field team see this name.</p>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field
          id="name"
          label="Your name"
          autoComplete="name"
          placeholder="Riya"
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          hint="2 to 60 letters"
        />
        {error && <Banner tone="bad">{error}</Banner>}
        <Button type="submit" busy={busy} disabled={!valid}>
          Done
        </Button>
      </form>
    </Page>
  )
}
