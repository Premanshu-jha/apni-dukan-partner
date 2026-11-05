/** "₹1,250" from paise; "from ₹1,250" when the price can go up at the salon. */
export function rupees(paise: number, isFrom = false): string {
  const digits = paise % 100 === 0 ? 0 : 2
  const amount = (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  return `${isFrom ? 'from ' : ''}₹${amount}`
}

/** "45 min" or "1 h 30 min". */
export function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}
