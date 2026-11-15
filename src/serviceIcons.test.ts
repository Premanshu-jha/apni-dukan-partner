import { describe, expect, it } from 'vitest'
import { pickedIcon } from './features/setup/Services'
import { ICON_DRAWINGS, ICON_LABELS, iconOf, iconsFor, SERVICE_ICONS } from './lib/serviceIcons'
import { priceNow, walkInTotal } from './lib/walkIn'
import type { ServiceItem } from './api/types'

describe('which pictures fit a service', () => {
  it('offers only the ones its name fits, always with the general one (salon chair) last', () => {
    expect(iconsFor('Haircut')).toEqual(['HAIRCUT', 'OTHER'])
    expect(iconsFor('Kids haircut')).toEqual(['KIDS', 'HAIRCUT', 'OTHER'])
    expect(iconsFor('Beard trim')).toEqual(['BEARD', 'TRIM', 'HAIRCUT', 'OTHER'])
    expect(iconsFor('Trim')[0]).toBe('TRIM')   // a clipper before scissors
    expect(iconsFor('Moustache trim')).toEqual(['MOUSTACHE', 'TRIM', 'HAIRCUT', 'OTHER'])
    expect(iconsFor('Haircut and beard')).toEqual(['HAIRCUT', 'BEARD', 'OTHER'])   // the one named first leads
    expect(iconsFor('Gel polish')).toEqual(['MANICURE', 'OTHER'])
    expect(iconsFor('Beard colour')).toEqual(['BEARD', 'HAIR_COLOUR', 'OTHER'])
    expect(iconsFor('Hair wash')).toEqual(['HAIR_WASH', 'OTHER'])   // never scissors for a wash
    expect(iconsFor('Special package')).toEqual(['PACKAGE', 'OTHER'])
    expect(iconsFor('Something new')).toEqual(['OTHER'])
    expect(iconsFor('')).toEqual(['OTHER'])
  })

  it('reads the name in any case, order, spacing or punctuation', () => {
    for (const n of ['HAIR CUT', 'hair-cut', 'hair.cut', 'hair , cut', 'hair@cut', 'cut.hair', 'Haircutting', '  HAIRCUT  ', '“Haircut”', 'Ｈａｉｒｃｕｔ', 'hair_cut', '₹199 haircut']) {
      expect(iconsFor(n)[0], n).toBe('HAIRCUT')
    }
    for (const n of ['massage Head', 'Head.massage', 'Head   massage', 'head,massage', 'Head/massage']) {
      expect(iconsFor(n)[0], n).toBe('HEAD_MASSAGE')
    }
    expect(iconsFor('Make up')[0]).toBe('MAKEUP')
    expect(iconsFor('MAKE-UP')[0]).toBe('MAKEUP')
    expect(iconsFor('beardtrim')[0]).toBe('BEARD')
    expect(iconsFor('(beard)')[0]).toBe('BEARD')
  })

  it('reads names written in Devanagari (its vowel signs kept in the word)', () => {
    const cases: [string, string][] = [
      ['बाल कटिंग', 'HAIRCUT'], ['दाढ़ी', 'BEARD'], ['सिर की मालिश', 'HEAD_MASSAGE'], ['चोटी', 'BRAIDS'], ['मूंछ', 'MOUSTACHE'], ['फेशियल', 'FACIAL'], ['मेहंदी', 'MEHENDI'],
      ['आइब्रो थ्रेडिंग', 'THREADING'], ['शेविंग', 'SHAVE'], ['बच्चों की कटिंग', 'KIDS'],
    ]
    for (const [name, icon] of cases) expect(iconsFor(name)[0], name).toBe(icon)
    expect(iconsFor('दाढ़ी'.normalize('NFD'))[0]).toBe('BEARD')   // however its dot below is written
  })

  it('puts the service before a word that only hints, and never reads a word inside a longer one', () => {
    const cases: [string, string][] = [
      ['Spa pedicure', 'PEDICURE'], ['Spa manicure', 'MANICURE'], ['Oil massage', 'HEAD_MASSAGE'], ['Hair oil massage', 'HEAD_MASSAGE'],
      ['Steam facial', 'FACIAL'], ['Boy cut', 'HAIRCUT'], ['Skin fade', 'HAIRCUT'], ['Hair gel', 'STYLING'],
      ['Hair wax', 'STYLING'], ['Hair relaxer', 'STRAIGHTENING'], ['Lip colour', 'MAKEUP'], ['Nose wax', 'WAXING'],
      ['Mani pedi', 'MANICURE'], ['Hair extension', 'OTHER'], ['Gel nails', 'MANICURE'], ['Face pack', 'FACIAL'],
      ['Hair pack', 'HAIR_SPA'], ['Babylights', 'HAIR_COLOUR'], ['Side locks', 'THREADING'], ['Upper lips', 'THREADING'],
    ]
    for (const [name, icon] of cases) expect(iconsFor(name)[0], name).toBe(icon)
    expect(iconsFor("Men's grooming")).not.toContain('BRIDAL')
    expect(iconsFor('Permanent colour')).not.toContain('CURLS')
    expect(iconsFor('Chinese facial')).not.toContain('THREADING')
    expect(iconsFor('Legs massage')[0]).toBe('MASSAGE')
    for (const [name, icon] of [['Full arms', 'WAXING'], ['Half legs', 'WAXING'], ['Full body wax', 'WAXING'], ['Hand wax', 'WAXING'],
      ['Steam bath', 'BODY_SPA'], ['Hair hydration', 'OTHER'], ['Hairdo', 'STYLING'], ['बाल कलर', 'HAIR_COLOUR'], ['बाल स्पा', 'HAIR_SPA'],
      ['Hand massage', 'MASSAGE'], ['Body massage', 'MASSAGE']] as const) {
      expect(iconsFor(name)[0], name).toBe(icon)
    }
    expect(iconsFor('Ear cleaning')).not.toContain('PIERCING')
    expect(iconsFor('Face pack')).not.toContain('PACKAGE')
    expect(iconsFor('Body spa')[0]).toBe('BODY_SPA')
    for (const [name, icon] of [['Body malish', 'MASSAGE'], ['Full body maalish', 'MASSAGE'], ['बॉडी मालिश', 'MASSAGE'],
      ['Body oil massage', 'MASSAGE'], ['हेड मसाज', 'HEAD_MASSAGE'], ['Relaxing head massage', 'HEAD_MASSAGE'],
      ['बाल धोना', 'HAIR_WASH'], ['Upper lip wax', 'WAXING'], ['Party hairstyle', 'STYLING'], ['Acne treatment', 'FACIAL'],
      ['सिर मुंडन', 'KIDS'], ['Baal dhona', 'HAIR_WASH'], ['Baal colour', 'HAIR_COLOUR'], ['Pair ki maalish', 'MASSAGE'], ['Daari', 'BEARD'], ['Muchh', 'MOUSTACHE'], ['Bal katai', 'HAIRCUT']] as const) {
      expect(iconsFor(name)[0], name).toBe(icon)
    }
    expect(iconsFor('Hair trim')).toEqual(['TRIM', 'HAIRCUT', 'OTHER'])   // a clipper first, scissors too (ladies' trims)
    expect(iconsFor('Head and shoulder massage')).toContain('HEAD_MASSAGE')
    expect(iconsFor('बाल धोना')).not.toContain('HAIRCUT')   // never scissors for a wash
  })

  it('covers the services salons offer, including the ones owners type in', () => {
    const cases: [string, string][] = [
      ['Clean shave', 'SHAVE'], ['Hair colour', 'HAIR_COLOUR'], ['Global highlights', 'HAIR_COLOUR'],
      ['Hair straightening', 'STRAIGHTENING'], ['Keratin smoothening', 'STRAIGHTENING'], ['Perm', 'CURLS'],
      ['Blow dry', 'STYLING'], ['Hair spa', 'HAIR_SPA'], ['Dandruff treatment', 'HAIR_SPA'], ['Facial', 'FACIAL'],
      ['De-tan', 'FACIAL'], ['Face clean-up', 'FACIAL'], ['Clean up', 'FACIAL'], ['Head massage', 'HEAD_MASSAGE'],
      ['Champi', 'HEAD_MASSAGE'], ['Maalish', 'HEAD_MASSAGE'], ['Body massage', 'MASSAGE'], ['Massage', 'MASSAGE'], ['Eyebrow threading', 'THREADING'], ['Upper lip', 'THREADING'], ['Full arms waxing', 'WAXING'],
      ['Rica wax', 'WAXING'], ['Manicure', 'MANICURE'], ['Nail art', 'MANICURE'], ['Gel polish', 'MANICURE'],
      ['Pedicure', 'PEDICURE'], ['Foot spa', 'PEDICURE'], ['Eyelash extension', 'EYELASH'], ['Nail extension', 'MANICURE'], ['Lash lift', 'EYELASH'],
      ['Party makeup', 'MAKEUP'], ['Saree draping', 'OTHER'], ['Tattoo', 'OTHER'], ['Hair trim', 'TRIM'], ['Machine cut', 'TRIM'], ['Choti', 'BRAIDS'], ['French braid', 'BRAIDS'], ['Moustache styling', 'MOUSTACHE'], ['Head shave', 'SHAVE'], ['Bridal makeup', 'BRIDAL'], ['Mehndi', 'MEHENDI'],
      ['Body polishing', 'BODY_SPA'], ['Ear piercing', 'PIERCING'], ['Groom package', 'BRIDAL'], ['Haircut and beard', 'HAIRCUT'], ['Nail polish', 'MANICURE'], ["Women's haircut", 'HAIRCUT'],
    ]
    for (const [name, icon] of cases) expect(iconsFor(name)[0], name).toBe(icon)
  })

  it('never takes a short word from inside another', () => {
    expect(iconsFor('Standard')).toEqual(['OTHER'])   // not a tan
    expect(iconsFor('Lipstick')).not.toContain('THREADING')   // not a lip
    expect(iconsFor('Cute look')).not.toContain('HAIRCUT')
  })

  it('draws the owner’s choice, else the best fit; keeps a picked one only while it fits the name', () => {
    expect(iconOf({ name: 'Haircut', icon: 'OTHER' })).toBe('OTHER')
    expect(iconOf({ name: 'Haircut', icon: null })).toBe('HAIRCUT')
    expect(iconOf({ name: 'Haircut', icon: 'NOT_ONE' })).toBe('HAIRCUT')
    expect(pickedIcon({ name: 'Kids haircut', icon: 'HAIRCUT' })).toBe('HAIRCUT')
    expect(pickedIcon({ name: 'Hair wash', icon: 'HAIRCUT' })).toBe('HAIR_WASH')   // renamed: the old pick no longer fits
    expect(pickedIcon({ name: 'Something', icon: null })).toBe('OTHER')
    // Editing only the price keeps the saved picture, even one the name isn't offered now; a new name drops it
    expect(pickedIcon({ name: 'Beard trim', icon: 'SHAVE', savedName: 'Beard trim' })).toBe('SHAVE')
    expect(pickedIcon({ name: 'Head massage', icon: 'MANICURE', savedName: 'Hand massage' })).toBe('HEAD_MASSAGE')
    // A saved name this app doesn't know (a newer backend's) is never sent back: the best fit, even with the name as saved
    expect(pickedIcon({ name: 'Haircut', icon: 'SOMETHING_NEWER' as never, savedName: 'Haircut' })).toBe('HAIRCUT')
    expect(iconOf({ name: 'Haircut', icon: 'SOMETHING_NEWER' })).toBe('HAIRCUT')
  })

  it('has a drawing and a label for every icon', () => {
    for (const i of SERVICE_ICONS) {
      expect(ICON_DRAWINGS[i].length, i).toBeGreaterThan(0)
      expect(ICON_LABELS[i], i).toBeTruthy()
    }
  })
})

describe('the walk-in total', () => {
  const svc = (id: string, paise: number, minutes: number, from = false): ServiceItem =>
    ({ id, name: id, durationMinutes: minutes, pricePaise: paise, priceIsFrom: from, active: true, sortOrder: 0, returnAfterDays: 14, version: 0, createdAt: '', updatedAt: '' })
  const cut = svc('cut', 15000, 30)
  const beard = svc('beard', 8000, 15)

  it('adds up what is ticked, with the offer price now', () => {
    const prices = [{ serviceId: 'cut', pricePaise: 12000, priceIsFrom: false, listPricePaise: 15000, offerUntil: '14:00' }, { serviceId: 'beard', pricePaise: 8000, priceIsFrom: false, listPricePaise: null, offerUntil: null }]
    expect(walkInTotal([cut, beard], prices)).toEqual({ count: 2, minutes: 45, pricePaise: 20000, listPricePaise: 23000, priceIsFrom: false, offerUntil: '14:00' })
    expect(walkInTotal([beard], prices)).toEqual({ count: 1, minutes: 15, pricePaise: 8000, listPricePaise: null, priceIsFrom: false, offerUntil: null })
    expect(walkInTotal([], prices)).toEqual({ count: 0, minutes: 0, pricePaise: 0, listPricePaise: null, priceIsFrom: false, offerUntil: null })
  })

  it('uses the service’s own price until the prices are read, and says "from" when one can cost more', () => {
    expect(priceNow(cut, undefined)).toEqual({ pricePaise: 15000, listPricePaise: null, offerUntil: null })
    expect(walkInTotal([cut, svc('colour', 80000, 60, true)], undefined)).toMatchObject({ pricePaise: 95000, listPricePaise: null, priceIsFrom: true })
  })
})
