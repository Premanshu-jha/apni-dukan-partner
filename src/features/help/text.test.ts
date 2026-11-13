import { describe, expect, it } from 'vitest'
import { cleanedLength } from './text'

describe('cleanedLength counts as the backend (MessageText.clean)', () => {
  it('drops invisible characters, so they never switch Send on', () => {
    expect(cleanedLength('a​​')).toBe(1)
    expect(cleanedLength('​​')).toBe(0)
  })
  it('makes look-alike letters normal (NFKC): a ligature counts as two letters', () => {
    expect(cleanedLength('ﬁ')).toBe(2)
  })
  it('keeps line breaks, drops spaces before them and more than two empty lines', () => {
    expect(cleanedLength('ab  \r\ncd')).toBe(5)
    expect(cleanedLength('a\n\n\n\n\nb')).toBe(5)
    expect(cleanedLength('  ab \t')).toBe(2)
  })
})
