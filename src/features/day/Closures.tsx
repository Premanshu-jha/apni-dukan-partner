import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { explain, isApiError, messageOf } from '../../api/errors'
import { dayApi, salonKeys, refreshSalonWork } from '../../api/salon'
import type { InTheWay } from '../../api/types'
import { AHEAD_DAYS } from './Today'
import { Banner, Button, Card, ErrorState, Field, Loading, Page } from '../../components/ui'
import { addDays, dateOfIst, dateTimeIst, dayLabel, timeIst, todayIst } from '../../lib/ist'

/** Close the whole salon for a day (a festival, a family function). Owner only. */
export function Closures() {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: salonKeys.closures, queryFn: dayApi.closures })
  const today = todayIst()
  const [date, setDate] = useState(addDays(today, 1))
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [inTheWay, setInTheWay] = useState<InTheWay[] | null>(null)

  async function act(id: string, call: () => Promise<unknown>) {
    setBusy(id)
    setError(null)
    setInTheWay(null)
    try {
      await call()
    } catch (e) {
      setError(explain(e))
      if (isApiError(e, 'BLOCK_CONFLICTS')) {
        const l = e.details.appointments
        setInTheWay(Array.isArray(l) ? (l as InTheWay[]) : [])
      }
    } finally {
      setBusy(null)
      refreshSalonWork(qc, [salonKeys.closures])
    }
  }

  return (
    <Page back="/more" title="Closed days">
      <Card className="flex flex-col gap-3">
        <Field id="closed-date" label="Close the salon on" type="date" min={today} max={addDays(today, AHEAD_DAYS)} value={date} onChange={(e) => setDate(e.target.value)} />
        <p className="text-sm text-muted">Nobody can book that day. Anything already booked must be moved or cancelled first.</p>
        <Button busy={busy === 'add'} disabled={!date || date < today} onClick={() => act('add', () => dayApi.addClosure(date))}>
          Close {date ? dayLabel(date) : ''}
        </Button>
      </Card>
      {error && <Banner tone="bad">{error}</Banner>}
      {inTheWay && inTheWay.length > 0 && (
        <Card className="flex flex-col gap-2 border-warn/50">
          <p className="font-semibold">{inTheWay.length} already on that day</p>
          <ul className="flex flex-col gap-1 text-sm">
            {inTheWay.map((a) => (
              <li key={a.id}>
                <Link className="text-brand underline" to={`/salon/day?date=${dateOfIst(a.startsAt)}`}>
                  {dateTimeIst(a.startsAt)}–{timeIst(a.endsAt)} ({a.kind === 'BLOCK' ? 'a break' : a.kind === 'WALK_IN' ? 'walk-in' : 'booking'})
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <h2 className="text-sm font-semibold text-muted">Coming closed days</h2>
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState message={messageOf(list.error)} onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <p className="text-muted">None.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.data.map((c) => (
            <li key={c.closureId}>
              <Card className="flex items-center justify-between gap-3">
                <span>{dayLabel(c.date)}</span>
                <Button variant="secondary" busy={busy === c.closureId} onClick={() => act(c.closureId, () => dayApi.removeClosure(c.closureId))}>
                  Open again
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Page>
  )
}
