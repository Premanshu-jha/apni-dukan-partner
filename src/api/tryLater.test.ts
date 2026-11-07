import { ApiError, messageOf } from './errors'

describe('429 TRY_LATER on sign-in codes', () => {
  it('says how many minutes this network must wait, from Retry-After', () => {
    const later = (s: number | null) => new ApiError(429, { code: 'TRY_LATER', message: 'Many tries for this number today.' }, s)
    expect(messageOf(later(240))).toBe('Too many tries from this network. Try again in 4 minutes.')
    expect(messageOf(later(30))).toBe('Too many tries from this network. Try again in 1 minute.')
    expect(messageOf(later(null))).toBe('Too many tries from this network. Try again in 1 minute.')
    // LOCKED_FOR_TODAY (now only the guessing network) keeps the backend's own words
    expect(messageOf(new ApiError(429, { code: 'LOCKED_FOR_TODAY', message: 'Too many wrong codes today.' }, 3600))).toBe('Too many wrong codes today.')
  })
})
