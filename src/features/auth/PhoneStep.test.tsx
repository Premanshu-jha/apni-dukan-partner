import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { PhoneStep } from './PhoneStep'

describe('PhoneStep', () => {
  it('only allows sending a code for a valid Indian mobile number', async () => {
    render(
      <MemoryRouter>
        <PhoneStep />
      </MemoryRouter>,
    )
    const send = screen.getByRole('button', { name: 'Send code' })
    expect(send).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Mobile number'), '12345')
    expect(send).toBeDisabled()
    await userEvent.clear(screen.getByLabelText('Mobile number'))
    await userEvent.type(screen.getByLabelText('Mobile number'), '+91 98480 12345')
    expect(send).toBeEnabled()
  })
})
