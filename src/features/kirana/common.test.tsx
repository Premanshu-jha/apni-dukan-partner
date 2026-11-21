import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ApiError } from '../../api/errors'
import { outcomeUnknown, useUnsureSend } from './common'

afterEach(() => sessionStorage.clear())

describe('a send whose answer never came', () => {
  it('keeps its clientRef and values when the sheet is closed and opened again', () => {
    const first = renderHook(() => useUnsureSend<{ amountPaise: number }>('pay:kc1'))
    const ref = first.result.current.clientRef
    act(() => first.result.current.keep({ amountPaise: 5000 }))
    first.unmount()

    const again = renderHook(() => useUnsureSend<{ amountPaise: number }>('pay:kc1'))
    expect(again.result.current.clientRef).toBe(ref)
    expect(again.result.current.unsure).toEqual({ amountPaise: 5000 })
  })

  it('starts a new send once settled, and keeps one form apart from another', () => {
    const a = renderHook(() => useUnsureSend<{ n: number }>('stock:kp1'))
    const b = renderHook(() => useUnsureSend<{ n: number }>('stock:kp2'))
    const ref = a.result.current.clientRef
    act(() => a.result.current.keep({ n: 1 }))
    expect(b.result.current.unsure).toBeNull()
    act(() => a.result.current.settle())
    expect(a.result.current.unsure).toBeNull()
    expect(a.result.current.clientRef).not.toBe(ref)
    expect(sessionStorage.getItem('adp.kiranaUnsure.stock:kp1')).toBeNull()
  })
})

describe('whether a failure may have been saved', () => {
  it('is unsure offline and on the server’s trouble, but not when it was too busy to start', () => {
    expect(outcomeUnknown(new ApiError(0, { code: 'NETWORK' }))).toBe(true)
    expect(outcomeUnknown(new ApiError(502, { code: 'BAD_GATEWAY' }))).toBe(true)
    expect(outcomeUnknown(new ApiError(503, { code: 'SERVICE_BUSY' }))).toBe(false)
    expect(outcomeUnknown(new ApiError(409, { code: 'KHATA_LIMIT' }))).toBe(false)
  })
})
