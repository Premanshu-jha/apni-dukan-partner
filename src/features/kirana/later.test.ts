import { describe, expect, it } from 'vitest'
import { forgetLater, keepForLater } from './later'

describe('barcodes billed without a product, kept to add later (F-11)', () => {
  it('newest first, once each, per shop; forgotten once a product has it', () => {
    keepForLater('s1', '111')
    keepForLater('s1', '222')
    keepForLater('s1', '111')
    keepForLater('s2', '333')
    expect(JSON.parse(localStorage.getItem('adp.kiranaLater.s1')!)).toEqual(['111', '222'])
    forgetLater('s1', '111')
    forgetLater('s1', '222')
    expect(localStorage.getItem('adp.kiranaLater.s1')).toBeNull()
    expect(JSON.parse(localStorage.getItem('adp.kiranaLater.s2')!)).toEqual(['333'])
  })
  it('keeps at most 50', () => {
    for (let i = 0; i < 60; i++) keepForLater('s3', String(i))
    const kept = JSON.parse(localStorage.getItem('adp.kiranaLater.s3')!) as string[]
    expect(kept).toHaveLength(50)
    expect(kept[0]).toBe('59')
  })
})
