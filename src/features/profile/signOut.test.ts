import { QueryClient } from '@tanstack/react-query'
import { lastScreen } from '../help/lastScreen'
import { forgetThisPerson } from './signOut'

describe('signing out forgets this tab\'s work too (a shared phone)', () => {
  it('kirana setup lines, send references, the khata sheet to reopen, and the screen before More', async () => {
    sessionStorage.setItem('adp.kiranaLine.l1', '{"name":"Sugar","count":"12"}')
    sessionStorage.setItem('adp.kiranaRef.count.p1', 'ref')
    sessionStorage.setItem('adp.kiranaKhataReturn', '{"customer":"c1"}')
    sessionStorage.setItem('adp.somethingElse', 'kept')
    // The screen before More is noted by the layouts (lastScreen.ts); set it the way they do
    const { useNoteScreen } = await import('../help/lastScreen')
    const { renderHook } = await import('@testing-library/react')
    const { MemoryRouter } = await import('react-router')
    const { createElement } = await import('react')
    renderHook(() => useNoteScreen(), { wrapper: ({ children }) => createElement(MemoryRouter, { initialEntries: ['/kirana/counter'] }, children) })
    expect(lastScreen()).toBe('/kirana/counter')
    forgetThisPerson(new QueryClient())
    expect(sessionStorage.getItem('adp.kiranaLine.l1')).toBeNull()
    expect(sessionStorage.getItem('adp.kiranaRef.count.p1')).toBeNull()
    expect(sessionStorage.getItem('adp.kiranaKhataReturn')).toBeNull()
    expect(sessionStorage.getItem('adp.somethingElse')).toBe('kept')
    expect(lastScreen()).toBeNull()
  })
})
