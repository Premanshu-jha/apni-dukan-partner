import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import type { Shop } from '../../api/types'
import { LeaveShop } from './LeaveShop'

const fake = vi.hoisted(() => ({ leave: vi.fn(), signOut: vi.fn(async () => {}) }))
vi.mock('../../api/shop', async (orig) => ({
  ...(await orig<typeof import('../../api/shop')>()),
  shopApi: { leave: fake.leave },
}))
vi.mock('./signOut', () => ({ signOutHere: fake.signOut }))

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

const shop = { name: 'Shine Unisex Salon', myRole: 'HELPER', type: 'SALON' } as Shop

function at(then?: '/invites') {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="*" element={<><LeaveShop shop={shop} then={then} /><Where /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('leaving a shop', () => {
  beforeEach(() => {
    localStorage.clear()
    fake.leave.mockReset()
    fake.signOut.mockClear()
  })

  it('says before it happens that it signs you out; a double tap leaves once', async () => {
    let finish!: () => void
    fake.leave.mockReturnValue(new Promise<void>((r) => (finish = r)))
    at()
    fireEvent.click(screen.getByRole('button', { name: 'Leave Shine Unisex Salon' }))
    expect(screen.getByText('Leaving signs you out here. Sign in again with the same number.')).toBeInTheDocument()
    const leave = screen.getByRole('button', { name: 'Leave' })
    fireEvent.click(leave)
    fireEvent.click(leave)
    expect(fake.leave).toHaveBeenCalledTimes(1)
    // While it is on its way: no Help to leave by, Cancel can't close it
    expect(screen.queryByRole('link', { name: 'Help' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await act(async () => finish())
    expect(screen.getByTestId('where')).toHaveTextContent('/signin')
  })

  it('left to accept another shop\'s invitation: signing in again opens the invitations', async () => {
    fake.leave.mockResolvedValue(undefined)
    at('/invites')
    fireEvent.click(screen.getByRole('button', { name: 'Leave Shine Unisex Salon' }))
    expect(screen.getByText(/Sign in again with the same number: your invitation opens straight away\./)).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Leave' })))
    expect(localStorage.getItem('adp.returnTo')).toBe('/invites')
  })

  it('a failed leave says so and can be tapped again', async () => {
    fake.leave.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    at()
    fireEvent.click(screen.getByRole('button', { name: 'Leave Shine Unisex Salon' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Leave' })))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Leave' })))
    expect(fake.leave).toHaveBeenCalledTimes(2)
  })
})
