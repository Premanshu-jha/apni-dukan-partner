import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Scanner } from './Scanner'

// The barcode reader's download fails, as offline on first use (no BarcodeDetector in this browser)
vi.mock('@zxing/library', () => {
  throw new Error('Failed to fetch dynamically imported module')
})

const stop = vi.fn()

beforeEach(() => {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) },
  })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  stop.mockClear()
})

describe('the scanner', () => {
  it("says the scanner couldn't load (not that the camera can't be used) when its reader doesn't download", async () => {
    render(<Scanner onCode={() => undefined} />)
    expect(await screen.findByText(/The scanner couldn't load/)).toBeInTheDocument()
    expect(screen.queryByText(/camera can't be used/)).not.toBeInTheDocument()
    expect(stop).toHaveBeenCalled() // the camera is switched off again
    expect(screen.getByLabelText('Or type the digits under the barcode')).toBeInTheDocument()
  })

  it("still says the camera can't be used on a phone without one", async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
    render(<Scanner onCode={() => undefined} />)
    expect(await screen.findByText(/camera can't be used/)).toBeInTheDocument()
  })

  it('with the camera refused: "Try the camera again" starts it afresh after the phone setting changed (F-07)', async () => {
    const getUserMedia = vi.fn().mockRejectedValueOnce(Object.assign(new Error('no'), { name: 'NotAllowedError' })).mockResolvedValue({ getTracks: () => [{ stop }] })
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
    render(<Scanner onCode={() => undefined} />)
    const again = await screen.findByRole('button', { name: 'Try the camera again' })
    again.click()
    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2))
  })
})

