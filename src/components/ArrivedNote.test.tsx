import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { ShopContext } from '../api/shop'
import type { Shop } from '../api/types'
import { ArrivedNote } from './ArrivedNote'

let lastState: unknown = 'unset'
function Where() {
  lastState = useLocation().state
  return null
}

function at(state: unknown, helpFrom?: string) {
  return render(
    <ShopContext.Provider value={{ ownerName: 'Ravi Kumar', type: 'KIRANA', myRole: 'HELPER' } as Shop}>
      <MemoryRouter initialEntries={[{ pathname: '/kirana/counter', state }]}>
        <Routes>
          <Route path="*" element={<><ArrivedNote helpFrom={helpFrom} /><Where /></>} />
        </Routes>
      </MemoryRouter>
    </ShopContext.Provider>,
  )
}

describe('why the home screen opened (shared: Today and the kirana counter)', () => {
  it('a refused screen: who can open it, Help back to this screen; only its own state is cleared', () => {
    at({ refused: 'owner', keep: 'this' })
    expect(screen.getByText('Only the owner can open that screen. Ask Ravi Kumar.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Help' })).toHaveAttribute('href', '/help?from=%2Fkirana%2Fcounter')
    // The note's own keys leave the address's state; anything else it was opened with stays
    expect(lastState).toEqual({ keep: 'this' })
  })

  it('a message with no screen says what it was about; Help comes back where it is told to', () => {
    at({ aboutMessage: 'Payment to your UPI ID failed' }, '/salon/day')
    expect(screen.getByText('That message is about: Payment to your UPI ID failed')).toBeInTheDocument()
    expect(lastState).toBeNull()
  })

  it('nothing to say: nothing drawn and the state left alone', () => {
    at({ from: '/more' })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(lastState).toEqual({ from: '/more' })
  })
})
