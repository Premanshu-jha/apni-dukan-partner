import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { provideForTests, resetLanguageForTests, setLanguage, type Messages } from '../../i18n'
import { fssaiReasonText } from './KiranaLicences'

const file = (lang: string, name: string) =>
  JSON.parse(readFileSync(join(process.cwd(), 'src/i18n', lang, `${name}.json`), 'utf8')) as Messages[string]

afterEach(() => resetLanguageForTests())

describe("the FSSAI check's reason", () => {
  it('stays as the backend wrote it in English', () => {
    const r = "We couldn't find the FSSAI number on the certificate. Your current licence keeps your shop open until 5 Mar 2027."
    expect(fssaiReasonText(r)).toBe(r)
  })

  it("is in the person's language: fixed reasons, the kept-licence note and the ones with a date or a number", async () => {
    provideForTests('hi', { server: file('hi', 'server'), kiranaRegister: file('hi', 'kiranaRegister') })
    await setLanguage('hi')
    expect(fssaiReasonText("We couldn't find the FSSAI number on the certificate.")).toBe('सर्टिफ़िकेट पर हमें FSSAI नंबर नहीं मिला।')
    expect(fssaiReasonText("We couldn't find the FSSAI number on the certificate. Your current licence keeps your shop open until 5 Mar 2027."))
      .toMatch(/^सर्टिफ़िकेट पर हमें FSSAI नंबर नहीं मिला। आपका पिछला लाइसेंस 5 \S+ 2027 तक चलेगा।$/)
    const expired = fssaiReasonText('This licence expired on 31 Oct 2026. Add the renewed certificate.')
    expect(expired).toMatch(/^इस लाइसेंस की तारीख 31 \S+ 2026 को निकल गई।/)
    expect(expired).not.toContain('Oct')
    expect(fssaiReasonText("The number on the certificate (12345678901234) isn't the one you typed (12345678901235). Check the number."))
      .toBe('सर्टिफ़िकेट पर लिखा नंबर (12345678901234) आपके डाले नंबर (12345678901235) से अलग है। नंबर जाँचें।')
    // A person's own words (the team's reason): as written
    expect(fssaiReasonText('Photo is of a different shop')).toBe('Photo is of a different shop')
  })
})
