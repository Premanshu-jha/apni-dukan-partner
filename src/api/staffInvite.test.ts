import { QueryClient } from '@tanstack/react-query'
import { forgetBarberInvite, salonKeys } from './salon'
import type { Staff } from './types'

const barber = (id: string, invitedPhone: string | null): Staff =>
  ({ id, name: id, active: true, serviceIds: [], hours: [], loginPhone: null, photoFileId: null, version: 0, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', invitedPhone })

describe("cancelling a barber's invitation from Team", () => {
  it('drops the phone from his card and page at once and reads the barbers again', () => {
    const qc = new QueryClient()
    qc.setQueryData(salonKeys.staff, [barber('st1', '9999900005'), barber('st2', '9999900006')])
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    forgetBarberInvite(qc, 'st1')
    expect(qc.getQueryData<Staff[]>(salonKeys.staff)!.map((s) => s.invitedPhone)).toEqual([null, '9999900006'])
    expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: salonKeys.staff, refetchType: 'all' }))
  })
  it('does nothing to a list not read yet', () => {
    const qc = new QueryClient()
    forgetBarberInvite(qc, 'st1')
    expect(qc.getQueryData(salonKeys.staff)).toBeUndefined()
  })
})
