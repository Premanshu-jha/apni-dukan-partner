import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { messageOf } from '../../api/errors'
import { dayApi, salonKeys } from '../../api/salon'
import { useShop } from '../../api/shop'
import type { Appointment } from '../../api/types'
import { Banner, Card, Chip, EmptyState, ErrorState, Field, Loading, Page } from '../../components/ui'
import { addDays, dateOfIst, dayLabel, todayIst } from '../../lib/ist'
import { rupees } from '../../lib/money'
import { can } from '../../lib/roles'
import { AppointmentCard } from './Today'
import { statusText } from './status'

/** Groups appointments by India date, keeping their order. */
export function byDate(list: Appointment[]): Array<{ date: string; items: Appointment[] }> {
  const groups: Array<{ date: string; items: Appointment[] }> = []
  for (const a of list) {
    const d = dateOfIst(a.startsAt)
    const last = groups.at(-1)
    if (last && last.date === d) last.items.push(a)
    else groups.push({ date: d, items: [a] })
  }
  return groups
}

/** Coming bookings across days, and (owner and helpers) the history with totals. */
export function Bookings() {
  const shop = useShop()
  const [tab, setTab] = useState<'upcoming' | 'history'>('upcoming')
  return (
    <Page title="Bookings">
      {can(shop.myRole).history && (
        <div className="flex gap-2" role="group" aria-label="Show">
          <Chip selected={tab === 'upcoming'} onClick={() => setTab('upcoming')}>
            Coming up
          </Chip>
          <Chip selected={tab === 'history'} onClick={() => setTab('history')}>
            History
          </Chip>
        </div>
      )}
      {tab === 'upcoming' ? <Upcoming /> : <History />}
    </Page>
  )
}

function Upcoming() {
  const navigate = useNavigate()
  const list = useQuery({ queryKey: salonKeys.upcoming, queryFn: dayApi.upcoming, refetchInterval: 60_000 })
  if (list.isPending) return <Loading />
  if (list.isError) return <ErrorState message={messageOf(list.error)} onRetry={() => list.refetch()} />
  if (list.data.length === 0) return <EmptyState title="No bookings coming up" body="New online bookings show here and on the day board." />
  return <Grouped list={list.data} onOpen={(a) => navigate(`/salon/day?date=${dateOfIst(a.startsAt)}`)} />
}

function History() {
  const navigate = useNavigate()
  const today = todayIst()
  const [from, setFrom] = useState(addDays(today, -6))
  const [to, setTo] = useState(today)
  const valid = from <= to && to <= today && to <= addDays(from, 30)
  const list = useQuery({ queryKey: salonKeys.history(from, to), queryFn: () => dayApi.history(from, to), enabled: valid })
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field id="history-from" label="From" type="date" max={to} value={from} onChange={(e) => setFrom(e.target.value)} />
        <Field id="history-to" label="To" type="date" min={from} max={today} value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      {!valid ? (
        <Banner tone="warn">Pick up to 31 days, ending today or earlier.</Banner>
      ) : list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState message={messageOf(list.error)} onRetry={() => list.refetch()} />
      ) : (
        <>
          <Card className="flex flex-col gap-2">
            <p className="text-sm text-muted">Done (at list prices)</p>
            <p className="text-2xl font-bold">{rupees(list.data.completedPaise)}</p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {Object.entries(list.data.counts).map(([status, n]) => (
                <li key={status}>
                  {statusText[status as keyof typeof statusText] ?? status}: <span className="font-semibold">{n}</span>
                </li>
              ))}
            </ul>
          </Card>
          {list.data.truncated && <Banner tone="info">Showing the latest 500. Pick fewer days to see all.</Banner>}
          {list.data.appointments.length === 0 ? (
            <EmptyState title="Nothing in these days" />
          ) : (
            <Grouped list={list.data.appointments} onOpen={(a) => navigate(`/salon/day?date=${dateOfIst(a.startsAt)}`)} />
          )}
        </>
      )}
    </>
  )
}

function Grouped({ list, onOpen }: { list: Appointment[]; onOpen: (a: Appointment) => void }) {
  return (
    <div className="flex flex-col gap-4">
      {byDate(list).map((g) => (
        <section key={g.date} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted">{dayLabel(g.date)}</h2>
          <ul className="flex flex-col gap-2">
            {g.items.map((a) => (
              <li key={a.id}>
                <AppointmentCard a={a} barber={null} onOpen={() => onOpen(a)} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
