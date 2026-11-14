import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LICENCE_FAST_FOR_MS, LICENCE_POLL_MS, LICENCE_SLOW_POLL_MS, useLicencePolling } from './features/shop/RegistrationDoc'

describe('useLicencePolling', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('reads the salon every few seconds at first, then every 30 seconds, and stops when the check ends', () => {
    const qc = new QueryClient()
    const reads = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue()
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    const { rerender } = renderHook(({ checking }) => useLicencePolling(checking), { wrapper, initialProps: { checking: true } })

    vi.advanceTimersByTime(LICENCE_POLL_MS * 3)
    expect(reads).toHaveBeenCalledTimes(3)
    vi.advanceTimersByTime(LICENCE_FAST_FOR_MS)   // past the first minutes
    reads.mockClear()
    vi.advanceTimersByTime(LICENCE_SLOW_POLL_MS * 2 + 10)
    expect(reads.mock.calls.length).toBeLessThanOrEqual(3)
    expect(reads.mock.calls.length).toBeGreaterThanOrEqual(2)

    rerender({ checking: false })
    reads.mockClear()
    vi.advanceTimersByTime(LICENCE_SLOW_POLL_MS * 4)
    expect(reads).not.toHaveBeenCalled()
  })
})
