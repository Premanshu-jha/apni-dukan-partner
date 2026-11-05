import { useEffect, useState } from 'react'

/**
 * The time now, updated every `everyMs`. Screens left open (a board on the counter overnight, a sheet waiting for
 * the no-show time) use it, so "today" and "from 4:45 PM" move on by themselves.
 */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(t)
  }, [everyMs])
  return now
}
