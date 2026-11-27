import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { SignUpWayOut } from './SignUpWayOut'

const fake = vi.hoisted(() => ({ signOut: vi.fn() }))
vi.mock('../profile/signOut', () => ({ signOutHere: fake.signOut }))

describe('the way out of sign-up', () => {
  it('a sign-out that failed can be tapped again (never stuck disabled)', async () => {
    fake.signOut.mockRejectedValueOnce(new Error('push')).mockResolvedValue(undefined)
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><SignUpWayOut screen="Your email" /></MemoryRouter>
      </QueryClientProvider>,
    )
    const button = screen.getByRole('button', { name: /Sign out and start again/ })
    await act(async () => fireEvent.click(button))
    expect(button).toBeEnabled()
    await act(async () => fireEvent.click(button))
    expect(fake.signOut).toHaveBeenCalledTimes(2)
  })
})
