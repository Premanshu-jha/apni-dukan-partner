import { missingSteps } from './session'

const base = { id: 'u', phone: '9848012345', admin: false }

describe('missingSteps', () => {
  it('asks for email first and name last', () => {
    expect(missingSteps({ ...base, name: null, email: null, emailVerified: false })).toEqual(['email', 'name'])
  })
  it('counts an unverified email as missing', () => {
    expect(missingSteps({ ...base, name: 'Riya', email: 'r@x.in', emailVerified: false })).toEqual(['email'])
  })
  it('is empty once everything is done', () => {
    expect(missingSteps({ ...base, name: 'Riya', email: 'r@x.in', emailVerified: true })).toEqual([])
  })
})
