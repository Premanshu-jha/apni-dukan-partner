import { describe, expect, it } from 'vitest'
import {
  addLoose,
  addOther,
  addProduct,
  amountOf,
  cleanUpiId,
  lineAmount,
  linesToSend,
  MAX_LINES,
  newCart,
  parseQty,
  parseRupees,
  qtyText,
  qtyWithUnit,
  rupeesInput,
  setLine,
  subtotalOf,
  totalOf,
  upiIdLooksRight,
  weightFor,
  withPrices,
  whatsAppReminder,
} from './kirana'
import { rupees } from './money'

const salt = { id: 'p1', name: 'Tata Salt 1 kg', unit: 'PIECE' as const, pricePaise: 2800 }
const sugar = { id: 'p2', name: 'Sugar', unit: 'KG' as const, pricePaise: 4800 }

describe('money and quantities, as the backend counts them', () => {
  it('price × quantity rounds half up to the paisa (Quantities.amount)', () => {
    expect(amountOf(4800, 250)).toBe(1200) // 250 g of ₹48/kg
    expect(amountOf(4999, 333)).toBe(1665) // 1664.667 → 1665
    expect(amountOf(1, 500)).toBe(1) // 0.5 → 1 (half up)
    expect(amountOf(2800, 3000)).toBe(8400)
  })

  it('a loose amount buys its weight to the gram, half up (BillService.productLine)', () => {
    expect(weightFor(3000, 4800)).toBe(625) // ₹30 of ₹48/kg = 0.625 kg
    expect(weightFor(1000, 3000)).toBe(333) // 0.3333 → 0.333
    expect(weightFor(1000, 6000)).toBe(167) // 0.16667 → 0.167
    expect(weightFor(1, 1_000_000)).toBe(0) // less than a gram
  })

  it('writes quantities without trailing zeros, with the unit', () => {
    expect(qtyText(2000)).toBe('2')
    expect(qtyText(250)).toBe('0.25')
    expect(qtyText(1005)).toBe('1.005')
    expect(qtyText(-1500)).toBe('-1.5')
    expect(qtyWithUnit(1000, 'PIECE')).toBe('1 pc')
    expect(qtyWithUnit(3000, 'PIECE')).toBe('3 pcs')
    expect(qtyWithUnit(500, 'KG')).toBe('0.5 kg')
  })

  it('reads typed quantities: pieces whole, kg to the gram, within the limits', () => {
    expect(parseQty('2', 'PIECE')).toEqual({ milli: 2000 })
    expect(parseQty('2.0', 'PIECE')).toEqual({ milli: 2000 })
    expect(parseQty('1.5', 'PIECE')).toEqual({ error: 'Pieces are whole numbers' })
    expect(parseQty('0,25', 'KG')).toEqual({ milli: 250 })
    expect(parseQty('0.0005', 'KG')).toEqual({ error: 'At most 3 decimals (grams)' })
    expect(parseQty('0', 'KG')).toEqual({ error: 'Must be more than 0' })
    expect(parseQty('0', 'KG', { zeroAllowed: true })).toEqual({ milli: 0 })
    expect(parseQty('10000', 'PIECE')).toEqual({ error: 'At most 9999' })
    expect(parseQty('500000', 'PIECE', { zeroAllowed: true })).toEqual({ milli: 500_000_000 })
    expect(parseQty('', 'PIECE')).toEqual({ error: 'Enter how many' })
    expect(parseQty('abc', 'KG')).toEqual({ error: 'Enter the weight in kg, like 0.5' })
  })

  it('reads typed rupees the way people type them', () => {
    expect(parseRupees('45')).toEqual({ paise: 4500 })
    expect(parseRupees('45.5')).toEqual({ paise: 4550 })
    expect(parseRupees('₹1,250')).toEqual({ paise: 125000 })
    expect(parseRupees('1.234')).toEqual({ error: 'Enter rupees, like 45 or 45.50' })
    expect(parseRupees('0')).toEqual({ error: 'Must be more than ₹0' })
    expect(parseRupees('0', { zeroAllowed: true })).toEqual({ paise: 0 })
    expect(parseRupees('200', { maxPaise: 10000 })).toEqual({ error: 'At most ₹100' })
    expect(rupeesInput(4550)).toBe('45.5')
    expect(rupeesInput(4505)).toBe('45.05')
    expect(rupeesInput(4500)).toBe('45')
  })

  it('cleans and checks a UPI ID as UpiIds does', () => {
    expect(cleanUpiId(' SharmaStore@OKHDFCBank ')).toBe('sharmastore@okhdfcbank')
    expect(upiIdLooksRight('sharmastore@okhdfcbank')).toBe(true)
    expect(upiIdLooksRight('sharmastore')).toBe(false)
    expect(upiIdLooksRight('a@b')).toBe(false)
    expect(upiIdLooksRight('98480.12345@ybl')).toBe(true)
  })
})

describe('the bill being made', () => {
  it('scanning a product again adds to its line; a carton adds its pack', () => {
    let c = addProduct(newCart(), salt, 1000)
    c = addProduct(c, salt, 1000)
    c = addProduct(c, salt, 12000)
    expect(c.lines).toHaveLength(1)
    expect(c.lines[0]).toMatchObject({ kind: 'product', milli: 14000 })
    expect(subtotalOf(c)).toBe(14 * 2800)
  })

  it('never goes past 9999 on one line', () => {
    const c = addProduct(addProduct(newCart(), salt, 9_000_000), salt, 2_000_000)
    expect(c.lines[0]).toMatchObject({ milli: 9_999_000 })
  })

  it('totals loose items by amount, items not in the list by price × how many, less the discount', () => {
    let c = addProduct(newCart(), salt, 2000)
    c = addLoose(c, sugar, 3000)
    c = addOther(c, '  Agarbatti ', 1500, 3)
    c = { ...c, discountPaise: 500 }
    expect(c.lines.map(lineAmount)).toEqual([5600, 3000, 4500])
    expect(subtotalOf(c)).toBe(13100)
    expect(totalOf(c)).toBe(12600)
    expect(linesToSend(c)).toEqual([
      { productId: 'p1', quantity: 2 },
      { productId: 'p2', amountPaise: 3000 },
      { name: 'Agarbatti', amountPaise: 1500, quantity: 3 },
    ])
  })

  it('a single item not in the list is sent without a quantity; kg goes to the gram', () => {
    let c = addOther(newCart(), 'Candle', 500, 1)
    c = addProduct(c, sugar, 1250)
    expect(linesToSend(c)).toEqual([{ name: 'Candle', amountPaise: 500 }, { productId: 'p2', quantity: 1.25 }])
  })

  it('a discount shrinks with the bill, so it is never more than what is left', () => {
    let c = addProduct(newCart(), salt, 1000)
    c = addOther(c, 'Candle', 500, 1)
    c = { ...c, discountPaise: 2000 }
    c = setLine(c, c.lines[0].key, () => null)
    expect(c.lines).toHaveLength(1)
    expect(c.discountPaise).toBe(500)
    expect(totalOf(c)).toBe(0)
  })

  it('each new cart has its own clientRef', () => {
    expect(newCart().clientRef).not.toBe(newCart().clientRef)
  })
})

describe('the bill keeps up with the product list', () => {
  const salt = { id: 'p1', name: 'Tata Salt 1 kg', unit: 'PIECE' as const, pricePaise: 2800 }

  it('takes the new price and name of a product scanned again', () => {
    let c = addProduct(newCart(), salt, 1000)
    c = addProduct(c, { ...salt, name: 'Tata Salt 1kg', pricePaise: 3000 }, 1000)
    expect(c.lines).toHaveLength(1)
    expect(c.lines[0]).toMatchObject({ name: 'Tata Salt 1kg', pricePaise: 3000, milli: 2000 })
    expect(subtotalOf(c)).toBe(6000)
  })

  it('changes nothing when the product is as it was', () => {
    const c = addProduct(newCart(), salt, 1000)
    expect(withPrices(c, salt)).toBe(c)
  })

  it('takes at most 100 lines (the backend refuses more): a new item waits for the next bill', () => {
    let c = newCart()
    for (let i = 0; i < MAX_LINES + 5; i++) c = addOther(c, `Item ${i}`, 100, 1)
    expect(c.lines).toHaveLength(MAX_LINES)
    expect(addProduct(c, salt, 1000).lines).toHaveLength(MAX_LINES)
    expect(addLoose(c, { id: 'p2', name: 'Sugar', pricePaise: 4500 }, 3000).lines).toHaveLength(MAX_LINES)
  })

  it('starts a new bill with nothing pending', () => {
    expect(newCart().pending).toBeNull()
  })
})

describe('the WhatsApp reminder', () => {
  it('is a wa.me link to the Indian number with the amount in the message', () => {
    const link = whatsAppReminder('9848012345', 'Sunita', 125000, 'Sharma Kirana', rupees)
    expect(link.startsWith('https://wa.me/919848012345?text=')).toBe(true)
    expect(decodeURIComponent(link.split('text=')[1])).toContain('₹1,250 is due on your khata')
  })
})
