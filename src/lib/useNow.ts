import { useEffect, useState } from 'react'
import { todayIst } from './ist'

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

/** Milliseconds from `now` to the next midnight in India (India has no daylight saving: always +05:30). */
export function msToIstMidnight(now: number): number {
  const day = 86_400_000
  const ist = now + 330 * 60_000
  return day - (((ist % day) + day) % day)
}

/**
 * Today's date in India, changing at midnight: one timer a day instead of a tick every 30 seconds, so a screen that
 * only needs the date (the day board with 2,000 cards) isn't drawn again for nothing. A phone asleep at midnight
 * misses the timer, so the date is also checked when the app comes back to the front.
 */
export function useTodayIst(): string {
  const [today, setToday] = useState(() => todayIst())
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const check = () => setToday(todayIst())
    const arm = () => {
      clearTimeout(t)
      // A second after midnight, so the new date is surely there
      t = setTimeout(() => {
        check()
        arm()
      }, msToIstMidnight(Date.now()) + 1000)
    }
    const onShow = () => {
      if (document.visibilityState === 'visible') {
        check()
        arm()
      }
    }
    arm()
    document.addEventListener('visibilitychange', onShow)
    return () => {
      clearTimeout(t)
      document.removeEventListener('visibilitychange', onShow)
    }
  }, [])
  return today
}
