import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { ShopContext } from '../api/shop'
import type { Shop } from '../api/types'
import { KindOnly, RoleOnly } from './guards'

function Where() {
  const l = useLocation()
  return <p data-testid="where">{l.pathname + JSON.stringify(l.state)}</p>
}

function at(path: string, shop: Partial<Shop>, guard: React.ReactNode) {
  render(
    <ShopContext.Provider value={shop as Shop}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={guard}>
            <Route path="/setup" element={<p>salon tab</p>} />
            <Route path="/kirana/team" element={<p>team</p>} />
          </Route>
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </ShopContext.Provider>,
  )
}

describe('the guards', () => {
  it('a kirana\'s fix asked for (/setup, the salon\'s tab) opens More, where its shop card and papers are', () => {
    at('/setup?fix=1', { type: 'KIRANA', myRole: 'OWNER' }, <KindOnly kind="SALON" />)
    expect(screen.getByTestId('where')).toHaveTextContent('/more')
  })

  it('a kirana typing /setup itself goes home, as before', () => {
    at('/setup', { type: 'KIRANA', myRole: 'OWNER' }, <KindOnly kind="SALON" />)
    expect(screen.getByTestId('where')).toHaveTextContent('/null')
  })

  it('a kirana on any other salon screen goes home, as before', () => {
    at('/kirana/team', { type: 'KIRANA', myRole: 'OWNER' }, <KindOnly kind="SALON" />)
    expect(screen.getByTestId('where')).toHaveTextContent('/null')
  })

  it('a kirana helper on an owner-only screen goes home saying why (the counter shows ArrivedNote)', () => {
    at('/kirana/team', { type: 'KIRANA', myRole: 'HELPER' }, <RoleOnly roles={['OWNER']} />)
    expect(screen.getByTestId('where')).toHaveTextContent('/{"refused":"owner"}')
  })
})
