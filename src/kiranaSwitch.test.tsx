import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { Children, isValidElement, type ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { Shop } from './api/types'

/**
 * The kirana switch's gates, both ways: the route table, the bottom bar, the type picker, Start's words and the shop
 * gate. The switch (src/lib/config) is mocked here; its own reading of VITE_KIRANA_ENABLED is in lib/config.test.ts.
 */
const sw = vi.hoisted(() => ({ on: false, shop: null as Shop | null }))
vi.mock('./lib/config', async (orig) => ({
  ...(await orig<typeof import('./lib/config')>()),
  kiranaOn: () => sw.on,
  shopTypeOn: (type: string) => type === 'SALON' || (type === 'KIRANA' && sw.on),
}))
vi.mock('./api/shop', async (orig) => ({
  ...(await orig<typeof import('./api/shop')>()),
  useMyShop: () => ({ isPending: false, isError: false, data: sw.shop, refetch: () => {} }),
}))

const { kiranaKindRoute, kiranaRegisterRoutes, kiranaScreenRoutes, kiranaTabRoutes } = await import('./app/kiranaRoutes')
const { tabsFor } = await import('./app/Shell')
const { App } = await import('./app/App')
const { pickedKind } = await import('./features/shop/Register')
const { startWords } = await import('./features/shop/Start')
const { ShopGate } = await import('./features/shop/ShopGate')
const { saveRegisterKind } = await import('./lib/registerDraft')

/** Every path in a route element (and its children), in order. */
function paths(node: ReactNode): string[] {
  const out: string[] = []
  Children.forEach(node, (child) => {
    if (!isValidElement<{ path?: string; children?: ReactNode }>(child)) return
    if (child.props.path) out.push(child.props.path)
    out.push(...paths(child.props.children))
  })
  return out
}

const allKiranaRoutes = () => [kiranaKindRoute(), kiranaRegisterRoutes(), kiranaTabRoutes(), kiranaScreenRoutes()]

function renderAt(path: string, ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

const kirana = { id: 's1', type: 'KIRANA', name: 'Sharma Kirana Store', status: 'APPROVED', myRole: 'OWNER' } as unknown as Shop

afterEach(() => {
  sw.on = false
  sw.shop = null
  localStorage.clear()
})

describe('kirana switch off (the default)', () => {
  it('registers no kirana route at all', () => {
    expect(allKiranaRoutes()).toEqual([null, null, null, null])
    expect(paths(allKiranaRoutes())).toEqual([])
  })

  it('sends an old /kirana/... link, and "What do you run?", to "Page not found"', () => {
    for (const path of ['/kirana/counter', '/kirana/bills/b1', '/kirana/licences', '/register/kind', '/register/upi']) {
      const view = renderAt(path, <App />)
      expect(screen.getByText('Page not found'), path).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Go to today' })).toBeInTheDocument()
      view.unmount()
    }
  })

  it('shows a salon’s tabs only, even for a kirana', () => {
    expect(tabsFor('OWNER', 'KIRANA').map((t) => t.to)).toEqual(['/salon/day', '/salon/bookings', '/setup', '/more'])
    expect(tabsFor('HELPER', 'SALON').map((t) => t.to)).toEqual(['/salon/day', '/salon/bookings', '/setup', '/more'])
  })

  it('never asks what you run: every shop registered is a salon, whatever was picked on this phone before', () => {
    saveRegisterKind('u1', 'KIRANA')
    expect(pickedKind('u1')).toBe('SALON')
    expect(pickedKind(undefined)).toBe('SALON')
  })

  it('keeps Start in the salon app’s words, straight to the salon’s “Before you start”', () => {
    expect(startWords()).toMatchObject({ ownTitle: 'register.ownSalonTitle', register: 'register.registerMySalon', registerPath: '/register/ready', workButton: 'register.workAtSalonButton' })
  })

  it('shows a kirana only "Kirana shops aren’t on Clozest yet", and nothing behind the gate', () => {
    sw.shop = kirana
    renderAt('/', (
      <Routes>
        <Route element={<ShopGate />}>
          <Route index element={<p>behind the gate</p>} />
        </Route>
      </Routes>
    ))
    expect(screen.getByText("Kirana shops aren't on Clozest yet")).toBeInTheDocument()
    expect(screen.queryByText('behind the gate')).toBeNull()
    expect(screen.getByRole('link', { name: 'Write to support' })).toBeInTheDocument()
  })
})

describe('kirana switch on', () => {
  beforeEach(() => {
    sw.on = true
  })

  it('registers every kirana route, as the kirana partner app had them', () => {
    expect(paths(allKiranaRoutes())).toEqual([
      '/register/kind',
      '/register/licences', '/register/upi',
      '/kirana/counter', '/kirana/bills', '/kirana/products', '/kirana/khata',
      '/kirana/bills/:id', '/kirana/day', '/kirana/products/new', '/kirana/products/:id', '/kirana/khata/:id',
      '/kirana/setup', '/kirana/setup/list', '/kirana/setup/lines', '/kirana/setup/skipped', '/kirana/setup/count', '/kirana/setup/photos',
      '/kirana/team', '/kirana/upi', '/kirana/licences',
    ])
  })

  it('finds /kirana/counter in the route table (signed out: the sign-in guard, not "Page not found")', () => {
    renderAt('/kirana/counter', <App />)
    expect(screen.queryByText('Page not found')).toBeNull()
  })

  it('gives a kirana its counter tabs and a salon its salon tabs', () => {
    expect(tabsFor('OWNER', 'KIRANA').map((t) => t.to)).toEqual(['/kirana/counter', '/kirana/bills', '/kirana/products', '/kirana/khata', '/more'])
    expect(tabsFor('BARBER', 'SALON').map((t) => t.to)).toEqual(['/salon/day', '/salon/bookings', '/more'])
  })

  it('asks what you run: the kind picked on this phone, by this person only', () => {
    expect(pickedKind('u1')).toBeNull()
    saveRegisterKind('u1', 'KIRANA')
    expect(pickedKind('u1')).toBe('KIRANA')
    expect(pickedKind('u2')).toBeNull()
  })

  it('says "I own a shop" on Start, then "What do you run?"', () => {
    expect(startWords()).toMatchObject({ ownTitle: 'register.ownShopTitle', register: 'register.registerMyShop', registerPath: '/register/kind', workButton: 'register.workAtShopButton' })
  })

  it('lets a kirana through the gate', () => {
    sw.shop = kirana
    renderAt('/', (
      <Routes>
        <Route element={<ShopGate />}>
          <Route index element={<p>behind the gate</p>} />
        </Route>
      </Routes>
    ))
    expect(screen.getByText('behind the gate')).toBeInTheDocument()
    expect(screen.queryByText("Kirana shops aren't on Clozest yet")).toBeNull()
  })
})
