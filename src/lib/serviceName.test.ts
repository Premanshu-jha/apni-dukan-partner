import { afterEach, describe, expect, it } from 'vitest'
import { setLanguage } from '../i18n'
import { serviceName } from './serviceName'

describe('serviceName', () => {
  afterEach(async () => {
    await setLanguage('en')
  })

  it('shows the name exactly as saved in English', () => {
    expect(serviceName('haircut')).toBe('haircut')
    expect(serviceName('Fade cut')).toBe('Fade cut')
  })

  it("spells a service list name in the reader's script, capitals and spaces ignored", async () => {
    await setLanguage('hi')
    expect(serviceName('Haircut')).toBe('हेयरकट')
    expect(serviceName('  beard   TRIM ')).toBe('बियर्ड ट्रिम')
    expect(serviceName("Women's haircut")).toBe('वीमेंस हेयरकट')
  })

  it('shows a name the salon typed itself as typed', async () => {
    await setLanguage('te')
    expect(serviceName('Fade cut')).toBe('Fade cut')
    expect(serviceName('Hair colour')).toBe('హెయిర్ కలర్')
  })
})
