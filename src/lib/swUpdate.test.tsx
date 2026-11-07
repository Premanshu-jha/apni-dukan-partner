import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UpdatePrompt } from '../components/UpdatePrompt'
import { resetUpdateOffer, watchForUpdates } from './swUpdate'

/** Just enough of a ServiceWorker: its state, statechange, postMessage. */
class FakeWorker extends EventTarget {
  state: ServiceWorkerState
  constructor(state: ServiceWorkerState) {
    super()
    this.state = state
  }
  postMessage = vi.fn()
  become(state: ServiceWorkerState) {
    this.state = state
    this.dispatchEvent(new Event('statechange'))
  }
}

class FakeRegistration extends EventTarget {
  waiting: FakeWorker | null = null
  installing: FakeWorker | null = null
  update = vi.fn(async () => {})
}

const container = new EventTarget() as EventTarget & { controller: object | null }

function setUp({ controlled }: { controlled: boolean }) {
  container.controller = controlled ? {} : null
  Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true })
  const reg = new FakeRegistration()
  return reg
}

const asRegistration = (r: FakeRegistration) => r as unknown as ServiceWorkerRegistration

describe('a new version (service worker update)', () => {
  const reload = vi.fn()
  beforeEach(() => {
    resetUpdateOffer()
    reload.mockReset()
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload })
  })
  afterEach(() => vi.restoreAllMocks())

  it('the first install (nothing to replace) offers nothing', () => {
    const reg = setUp({ controlled: false })
    render(<UpdatePrompt />)
    watchForUpdates(asRegistration(reg))
    const first = new FakeWorker('installing')
    reg.installing = first
    act(() => {
      reg.dispatchEvent(new Event('updatefound'))
      first.become('installed')
    })
    expect(screen.queryByText('New version available')).not.toBeInTheDocument()
  })

  it('a version that finishes installing is offered; Reload lets it take over, then reloads once', async () => {
    const reg = setUp({ controlled: true })
    render(<UpdatePrompt />)
    watchForUpdates(asRegistration(reg))
    const next = new FakeWorker('installing')
    reg.installing = next
    act(() => reg.dispatchEvent(new Event('updatefound')))
    expect(screen.queryByText('New version available')).not.toBeInTheDocument()
    act(() => next.become('installed'))
    expect(screen.getByRole('status')).toHaveTextContent('New version available')

    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(next.postMessage).toHaveBeenCalledWith({ kind: 'skip-waiting' })
    expect(reload).not.toHaveBeenCalled()
    container.dispatchEvent(new Event('controllerchange'))
    container.dispatchEvent(new Event('controllerchange'))
    expect(reload).toHaveBeenCalledOnce()
  })

  it('a version already waiting when the app opens is offered at once', () => {
    const reg = setUp({ controlled: true })
    reg.waiting = new FakeWorker('installed')
    render(<UpdatePrompt />)
    act(() => watchForUpdates(asRegistration(reg)))
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  })

  it('taken over in another tab meanwhile: Reload just loads the page again', async () => {
    const reg = setUp({ controlled: true })
    const next = new FakeWorker('installed')
    reg.waiting = next
    render(<UpdatePrompt />)
    act(() => watchForUpdates(asRegistration(reg)))
    next.state = 'activated'
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(next.postMessage).not.toHaveBeenCalled()
    expect(reload).toHaveBeenCalledOnce()
  })

  it('a waiting version replaced by a newer one is no longer offered', () => {
    const reg = setUp({ controlled: true })
    const next = new FakeWorker('installed')
    reg.waiting = next
    render(<UpdatePrompt />)
    act(() => watchForUpdates(asRegistration(reg)))
    act(() => next.become('redundant'))
    expect(screen.queryByText('New version available')).not.toBeInTheDocument()
  })

  it('looks for a new version when the app comes back to the screen', () => {
    const reg = setUp({ controlled: true })
    watchForUpdates(asRegistration(reg))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(reg.update).toHaveBeenCalled()
  })
})
