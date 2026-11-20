import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import { forgetDownloadsForTests, resetLanguageForTests, restoreLanguage, spaceBefore, useT } from './index'

const te = JSON.parse(readFileSync(join(process.cwd(), 'src/i18n/te/language.json'), 'utf8')) as Record<string, string>

function Title() {
  const t = useT()
  return <h1>{t('language.title')}</h1>
}

describe('partner extras to the shared language code', () => {
  afterEach(() => {
    resetLanguageForTests()
    window.localStorage.clear()
  })

  it('a screen drawn from the kept texts is drawn again when the download brings fresher ones', async () => {
    resetLanguageForTests()
    forgetDownloadsForTests()
    window.localStorage.setItem('language', 'te')
    window.localStorage.setItem('language.texts', JSON.stringify({ lang: 'te', messages: { language: { title: 'KEPT' } } }))
    let done: Promise<void> = Promise.resolve()
    act(() => {
      done = restoreLanguage()
    })
    render(<Title />)
    expect(screen.getByRole('heading')).toHaveTextContent('KEPT') // at once, no English first
    await act(async () => {
      await done
    })
    expect(screen.getByRole('heading')).toHaveTextContent(te.title)
  })

  it('puts no space before punctuation after a link (Hindi "।")', () => {
    expect(spaceBefore('।')).toBe('')
    expect(spaceBefore('. Check spam')).toBe('')
    expect(spaceBefore('what to fix.')).toBe(' ')
  })
})
