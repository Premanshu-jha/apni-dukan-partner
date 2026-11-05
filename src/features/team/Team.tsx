import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { messageOf } from '../../api/errors'
import { dayApi, salonKeys } from '../../api/salon'
import { shopApi } from '../../api/shop'
import type { Member } from '../../api/types'
import { Banner, Button, Card, ErrorState, Field, Loading, Page, Sheet, Switch } from '../../components/ui'
import { formatPhone, normalizePhone } from '../../lib/phone'

const roleText = { OWNER: 'Owner', HELPER: 'Helper', BARBER: 'Barber' } as const

/**
 * Everyone who signs in to this salon. The owner adds helpers by phone (barbers get a sign-in on their own page),
 * and chooses who may add walk-ins. Owner only.
 */
export function Team() {
  const qc = useQueryClient()
  const members = useQuery({ queryKey: salonKeys.members, queryFn: dayApi.members })
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<Member | null>(null)
  const normalized = normalizePhone(phone)

  async function act(id: string, call: () => Promise<unknown>, after?: () => void) {
    setBusy(id)
    setError(null)
    try {
      await call()
      after?.()
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(null)
      await qc.invalidateQueries({ queryKey: salonKeys.members })
    }
  }

  return (
    <Page back="/more" title="Team">
      {members.isPending ? (
        <Loading />
      ) : members.isError ? (
        <ErrorState message={messageOf(members.error)} onRetry={() => members.refetch()} />
      ) : (
        <ul className="flex flex-col gap-2">
          {members.data.map((m) => (
            <li key={m.userId}>
              <Card className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{m.name || 'No name yet'}</p>
                    <p className="text-sm text-muted">
                      {roleText[m.role]} · +91 {formatPhone(m.phone)}
                    </p>
                  </div>
                  {m.role === 'HELPER' && (
                    <Button variant="ghost" className="text-bad" onClick={() => setRemoving(m)}>
                      Remove
                    </Button>
                  )}
                </div>
                {m.role !== 'OWNER' && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm">Can add walk-ins</span>
                    <Switch
                      label={`${m.name || 'Member'} can add walk-ins`}
                      checked={m.walkInAccess}
                      disabled={busy === m.userId}
                      onChange={(on) => act(m.userId, () => dayApi.setWalkInAccess(m.userId, on))}
                    />
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
      {error && <Banner tone="bad">{error}</Banner>}
      <Card className="flex flex-col gap-3">
        <p className="font-semibold">Add a helper</p>
        <p className="text-sm text-muted">
          A helper runs the day with you: walk-ins, starting bookings, breaks. They sign in with this number. For a
          barber, give him a sign-in on his page under Salon › Barbers instead.
        </p>
        <Field id="helper-phone" label="Helper's mobile number" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Button busy={busy === 'add'} disabled={!normalized} onClick={() => act('add', () => shopApi.addHelper(normalized!), () => setPhone(''))}>
          Add helper
        </Button>
      </Card>
      <Sheet open={removing !== null} title="Remove helper?" onClose={() => setRemoving(null)}>
        <div className="flex flex-col gap-3">
          <p className="text-muted">{removing?.name || 'They'} will be signed out at once and can't open your salon any more.</p>
          <Button
            variant="danger"
            busy={busy === removing?.userId}
            onClick={() => removing && act(removing.userId, () => shopApi.removeHelper(removing.userId), () => setRemoving(null))}
          >
            Remove
          </Button>
          <Button variant="ghost" onClick={() => setRemoving(null)}>
            Cancel
          </Button>
        </div>
      </Sheet>
    </Page>
  )
}
