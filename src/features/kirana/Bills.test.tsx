import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Bill } from '../../api/kirana'
import { provideForTests, resetLanguageForTests, setLanguage, type Messages } from '../../i18n'
import { BillPage } from './Bills'

const state = vi.hoisted(() => ({ bill: null as unknown, returned: [] as unknown[] }))

vi.mock('../../api/kirana', async (orig) => {
  const real = await orig<typeof import('../../api/kirana')>()
  return {
    ...real,
    useBill: () => ({ isPending: false, isError: false, data: state.bill, refetch: vi.fn() }),
    kiranaApi: {
      ...real.kiranaApi,
      returnItems: vi.fn(async (_id: string, body: unknown) => {
        state.returned.push(body)
        return { bill: state.bill, stock: [], khata: null }
      }),
    },
  }
})
vi.mock('../../api/shop', async (orig) => ({
  ...(await orig<typeof import('../../api/shop')>()),
  useShop: () => ({ id: 'shop1', name: 'Sharma Store', myRole: 'OWNER', status: 'APPROVED', statusReason: null }),
}))

function bill(over: Partial<Bill> = {}): Bill {
  return {
    id: 'b1', billNo: 7, version: 1, createdAt: new Date().toISOString(), byId: 'u1', byName: 'Ravi',
    payment: 'CASH', khataCustomer: null, paidNowPaise: null, paidNowBy: null, onKhataPaise: 0,
    subtotalPaise: 7000, discountPaise: 0, totalPaise: 7000, refundedPaise: 0, voidedAt: null, voidReason: null,
    lines: [{ lineNo: 1, productId: 'soap', name: 'Lux Soap 100 g', unit: 'PIECE', quantity: 2, pricePaise: 3500, amountPaise: 7000, returnedQuantity: 0 }],
    returns: [], changes: [], writtenOn: null, paperPhotoFileId: null,
    ...over,
  } as unknown as Bill
}

function show() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/kirana/bills/b1']}>
        <Routes>
          <Route path="/kirana/bills/:id" element={<BillPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function inHindi() {
  const file = (name: string) => JSON.parse(readFileSync(join(process.cwd(), 'src/i18n/hi', `${name}.json`), 'utf8')) as Messages[string]
  provideForTests('hi', { kiranaBills: file('kiranaBills'), kiranaProducts: file('kiranaProducts'), common: file('common') })
  await act(async () => {
    await setLanguage('hi')
  })
}

afterEach(() => {
  resetLanguageForTests()
  state.returned = []
  sessionStorage.clear()
})

describe('items brought back', () => {
  it('saves a tapped reason in English, whatever the language, and a typed one as typed', async () => {
    state.bill = bill()
    await inHindi()
    show()
    fireEvent.click(screen.getByRole('button', { name: 'वापस लाई चीज़ें' }))
    fireEvent.change(screen.getByLabelText(/Lux Soap 100 g/), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'खराब निकला' }))
    expect(screen.getByLabelText('वजह (ज़रूरी नहीं)')).toHaveValue('खराब निकला')
    fireEvent.click(screen.getByRole('button', { name: 'वापसी सेव करें' }))
    await waitFor(() => expect(state.returned).toHaveLength(1))
    expect(state.returned[0]).toMatchObject({ lines: [{ lineNo: 1, quantity: 1 }], reason: 'Damaged' })
  })

  it('keeps typed words as typed (a chip tapped before is let go)', async () => {
    state.bill = bill()
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Items brought back' }))
    fireEvent.change(screen.getByLabelText(/Lux Soap 100 g/), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Expired' }))
    fireEvent.change(screen.getByLabelText('Reason (optional)'), { target: { value: 'पैकेट फटा था' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save the return' }))
    await waitFor(() => expect(state.returned).toHaveLength(1))
    expect(state.returned[0]).toMatchObject({ reason: 'पैकेट फटा था' })
  })

  it("shows a saved reason in the person's language, and a typed one as it was typed", async () => {
    const at = new Date().toISOString()
    state.bill = bill({
      returns: [
        { id: 'r1', at, refundPaise: 3500, offKhataPaise: 0, handBackPaise: 3500, handBackBy: 'CASH', byName: 'Ravi', reason: 'Wrong item' },
        { id: 'r2', at, refundPaise: 3500, offKhataPaise: 0, handBackPaise: 3500, handBackBy: 'CASH', byName: 'Ravi', reason: 'Leaking pack' },
      ],
    } as Partial<Bill>)
    await inHindi()
    show()
    expect(screen.getByText(/· गलत सामान$/)).toBeInTheDocument()
    expect(screen.getByText(/· Leaking pack$/)).toBeInTheDocument()
  })
})
