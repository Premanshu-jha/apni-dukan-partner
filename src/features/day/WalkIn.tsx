import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ApiError, explain, isApiError, messageOf } from '../../api/errors'
import { dayApi, useServices, refreshSalonWork } from '../../api/salon'
import { useShop } from '../../api/shop'
import { Banner, Button, Card, EmptyState, ErrorState, Field, Loading, Page } from '../../components/ui'
import { clock12 } from '../../lib/ist'
import { duration, rupees } from '../../lib/money'
import { newIdempotencyKey } from './status'

/**
 * A customer who walked in: pick the services, then a barber who is free now (or see when each is next free), and
 * add it. A walk-in starts now (it is in the chair at once). Owner, or someone the owner gave walk-in access.
 */
export function WalkIn() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const shop = useShop()
  const services = useServices()
  const [chosenIds, setPicked] = useState<string[]>([])
  const [staffId, setStaffId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // After no answer (or a server error) it may have been added: the choice is held as it was, so trying again with
  // the same key gives back that walk-in instead of adding a second one.
  const [held, setHeld] = useState(false)
  // One key per walk-in being added: a retry after a lost answer can't add it twice.
  const key = useRef(newIdempotencyKey())

  const active = services.data?.filter((s) => s.active) ?? []
  // A service the owner switched off meanwhile drops out of the choice (it can't be booked any more).
  const picked = chosenIds.filter((id) => active.some((s) => s.id === id))

  const options = useQuery({
    queryKey: ['salon', 'walk-in-options', ...picked],
    queryFn: () => dayApi.walkInOptions(picked),
    enabled: picked.length > 0,
    retry: false,
  })
  const notAllowed = isApiError(options.error, 'WALK_INS_NOT_ALLOWED')
  const nobody = isApiError(options.error, 'NO_BARBER_FOR_SERVICES')
  const chosen = active.filter((s) => picked.includes(s.id))
  const minutes = chosen.reduce((t, s) => t + s.durationMinutes, 0)
  const price = chosen.reduce((t, s) => t + s.pricePaise, 0)
  const option = options.data?.find((o) => o.staffId === staffId)

  function toggle(id: string) {
    setPicked((p) => {
      const now = p.filter((x) => active.some((s) => s.id === x))
      return now.includes(id) ? now.filter((x) => x !== id) : now.length >= 10 ? now : [...now, id]
    })
    setStaffId(null)
    setError(null)
    // A different walk-in now: a key sent before can't be reused for it.
    key.current = newIdempotencyKey()
  }

  async function add() {
    if (!staffId || busy) return
    if (name.trim().length === 1) {
      setError('Write at least 2 letters of the name, or leave it empty.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await dayApi.addWalkIn(key.current, { serviceIds: picked, staffId, name: name.trim() || null })
      refreshSalonWork(qc)
      navigate('/salon/day', { replace: true })
    } catch (e) {
      setError(explain(e))
      if (isApiError(e, 'BARBER_BUSY')) {
        setStaffId(null)
        void options.refetch()
      }
      // A clear refusal (4xx) means nothing was added: the next try is a new walk-in. With no answer, or a server
      // error, it may have been added: keep the key, so trying again gives back that same walk-in.
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        key.current = newIdempotencyKey()
        setHeld(false)
      } else {
        setHeld(true)
      }
    } finally {
      setBusy(false)
    }
  }

  if (shop.status === 'SUSPENDED') return <Page back="/salon/day" title="New walk-in"><Banner tone="bad">The salon is off the app.</Banner></Page>

  return (
    <Page back="/salon/day" title="New walk-in">
      {services.isPending ? (
        <Loading />
      ) : services.isError ? (
        <ErrorState message={messageOf(services.error)} onRetry={() => services.refetch()} />
      ) : active.length === 0 ? (
        <EmptyState title="No services yet" body="The owner adds services under Salon." />
      ) : notAllowed ? (
        <EmptyState title="Walk-ins need the owner's OK" body="Ask the owner to turn on walk-ins for you in Team." />
      ) : (
        <>
          <section className="flex flex-col gap-2" aria-label="Services">
            <p className="text-sm font-medium text-muted">What do they want?</p>
            {active.map((s) => (
              <label key={s.id} className="flex min-h-12 items-center gap-3 rounded-xl border border-line bg-surface px-4">
                <input type="checkbox" checked={picked.includes(s.id)} disabled={held} onChange={() => toggle(s.id)} className="h-5 w-5 accent-brand" />
                <span className="flex-1">{s.name}</span>
                <span className="text-sm text-muted">
                  {duration(s.durationMinutes)} · {rupees(s.pricePaise, s.priceIsFrom)}
                </span>
              </label>
            ))}
          </section>

          {picked.length > 0 && (
            <section className="flex flex-col gap-2" aria-label="Barber">
              <p className="text-sm font-medium text-muted">
                Who? ({duration(minutes)}, {rupees(price, chosen.some((s) => s.priceIsFrom))})
              </p>
              {options.isPending ? (
                <Loading />
              ) : nobody ? (
                <Banner tone="warn">No barber does all of these together. Add them as separate walk-ins.</Banner>
              ) : options.isError ? (
                <ErrorState message={explain(options.error)} onRetry={() => options.refetch()} />
              ) : options.data.length === 0 ? (
                <Banner tone="warn">No barber does all of these services.</Banner>
              ) : (
                options.data.map((o) => (
                  <button
                    key={o.staffId}
                    type="button"
                    aria-pressed={staffId === o.staffId}
                    disabled={!o.freeNow || held}
                    onClick={() => {
                      setStaffId(o.staffId)
                      key.current = newIdempotencyKey()
                    }}
                    className={`flex min-h-12 items-center justify-between rounded-xl border px-4 text-left disabled:opacity-50 ${staffId === o.staffId ? 'border-brand bg-brand/10' : 'border-line bg-surface'}`}
                  >
                    <span className="font-medium">{o.name}</span>
                    <span className="text-sm text-muted">
                      {o.freeNow ? 'Free now' : o.time ? `Busy · free at ${clock12(o.time)}` : 'No time left today'}
                    </span>
                  </button>
                ))
              )}
            </section>
          )}

          {option && (
            <Card className="flex flex-col gap-3">
              <Field id="guest-name" label="Customer's name (optional)" value={name} maxLength={60} disabled={held} onChange={(e) => setName(e.target.value)} />
              {held && <Banner tone="warn">We couldn't tell if it was added. Try again: it won't be added twice.</Banner>}
              {error && <Banner tone="bad">{error}</Banner>}
              <Button busy={busy} onClick={add}>
                Start now with {option.name}
              </Button>
            </Card>
          )}
          {error && !option && <Banner tone="bad">{error}</Banner>}
        </>
      )}
    </Page>
  )
}
