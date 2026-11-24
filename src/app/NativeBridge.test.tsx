import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { openInApp } from '../lib/appEvents'
import { NativeBridge } from './NativeBridge'
import { useLeaveGuard } from '../lib/leaveGuard'

const bridge = vi.hoisted(() => ({
  app: true,
  back: null as null | ((e: { canGoBack: boolean }) => void),
  minimize: vi.fn(async () => {}),
}))

vi.mock('../lib/platform', () => ({ isApp: () => bridge.app }))
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: async (name: string, fn: (e: { canGoBack: boolean }) => void) => {
      if (name === 'backButton') bridge.back = fn
      return { remove: async () => void (bridge.back = null) }
    },
    minimizeApp: bridge.minimize,
  },
}))

function Typing({ dirty }: { dirty: boolean }) {
  useLeaveGuard(dirty, 'You have changes that are not saved. Leave anyway?')
  return null
}

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

function show(start = '/salon/day') {
  return render(
    <MemoryRouter initialEntries={[start]}>
      <NativeBridge />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  bridge.app = true
  bridge.back = null
  bridge.minimize.mockClear()
})

describe('the Play Store app’s bridge to the router', () => {
  it('opens the screen a tapped notification asked for, also one asked before it was drawn', async () => {
    openInApp('/invites')
    show()
    expect(await screen.findByText('/invites')).toBeInTheDocument()
    openInApp('/handover')
    expect(await screen.findByText('/handover')).toBeInTheDocument()
  })

  it('Back closes an open sheet first, else goes back, else puts the app in the background', async () => {
    show()
    await vi.waitFor(() => expect(bridge.back).not.toBeNull())
    const sheet = document.createElement('div')
    sheet.setAttribute('role', 'dialog')
    sheet.setAttribute('aria-modal', 'true')
    document.body.append(sheet)
    const escape = vi.fn()
    document.addEventListener('keydown', escape)
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    bridge.back!({ canGoBack: true })
    expect(escape).toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape' }))
    expect(back).not.toHaveBeenCalled()
    sheet.remove()
    bridge.back!({ canGoBack: true })
    expect(back).toHaveBeenCalledTimes(1)
    bridge.back!({ canGoBack: false })
    expect(bridge.minimize).toHaveBeenCalledTimes(1)
    document.removeEventListener('keydown', escape)
  })

  it('does nothing on the website', async () => {
    bridge.app = false
    openInApp('/invites')
    show()
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.getByTestId('where')).toHaveTextContent('/salon/day')
    expect(bridge.back).toBeNull()
  })

  it('Back asks before leaving a screen with something typed and not saved; staying keeps the screen', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    const { rerender } = render(
      <MemoryRouter initialEntries={['/register']}>
        <NativeBridge />
        <Typing dirty />
      </MemoryRouter>,
    )
    await vi.waitFor(() => expect(bridge.back).not.toBeNull())
    confirm.mockReturnValueOnce(false)
    bridge.back!({ canGoBack: true })
    expect(confirm).toHaveBeenCalledWith('You have changes that are not saved. Leave anyway?')
    expect(back).not.toHaveBeenCalled()
    confirm.mockReturnValueOnce(true)
    bridge.back!({ canGoBack: true })
    expect(back).toHaveBeenCalledTimes(1)
    // Saved (nothing unsaved any more): Back goes back without asking
    rerender(
      <MemoryRouter initialEntries={['/register']}>
        <NativeBridge />
        <Typing dirty={false} />
      </MemoryRouter>,
    )
    confirm.mockClear()
    bridge.back!({ canGoBack: true })
    expect(confirm).not.toHaveBeenCalled()
    expect(back).toHaveBeenCalledTimes(2)
    confirm.mockRestore()
    back.mockRestore()
  })
})
