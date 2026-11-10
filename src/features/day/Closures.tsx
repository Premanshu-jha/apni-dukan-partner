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
  return (
    <Page back="/more" title="Closed days">
      <ClosedDaysEditor />
    </Page>
  )
}

/**
 * The salon's closed days (festival holidays): the whole salon, every barber, even before any barber is added
 * (the registration review step uses it too). The weekly off is set in the opening hours; leave is per barber.
 */
export function ClosedDaysEditor({ optional = false }: { optional?: boolean }) {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: salonKeys.closures, queryFn: dayApi.closures })
  const today = todayIst()
  const [date, setDate] = useState('')   // picked on purpose: one tap mustn't close tomorrow
  const Heading = optional ? 'h3' : 'h2'
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
    <>
      <Card className="flex flex-col gap-3">
        <Field id="closed-date" label="Close the salon on" type="date" min={today} max={addDays(today, AHEAD_DAYS)} value={date} onChange={(e) => setDate(e.target.value)} />
        <p className="text-sm text-muted">
          The whole salon is closed: every barber, including ones you add later. Anything already booked must be moved or
          cancelled first.
        </p>
        <Button
          variant={optional ? 'secondary' : 'primary'}
          busy={busy === 'add'}
          disabled={!date || date < today}
          onClick={() => act('add', () => dayApi.addClosure(date).then(() => setDate('')))}
        >
          {date ? `Close ${dayLabel(date)}` : 'Pick a day to close'}
        </Button>
      </Card>
      {error && <Banner tone="bad">{error}</Banner>}
      {inTheWay && inTheWay.length > 0 && (
        <Card className="flex flex-col gap-2 border-warn/50">
          <p className="font-semibold">{inTheWay.length} already on that day</p>
          <ul className="flex flex-col gap-1 text-sm">
            {inTheWay.map((a) => (
              <li key={a.id}>
                <Link className="text-link underline" to={`/salon/day?date=${dateOfIst(a.startsAt)}`}>
                  {dateTimeIst(a.startsAt)}–{timeIst(a.endsAt)} ({a.kind === 'BLOCK' ? 'a break' : a.kind === 'WALK_IN' ? 'walk-in' : 'booking'})
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Heading className="text-sm font-semibold text-muted">Coming closed days</Heading>
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
    </>
  )
}
