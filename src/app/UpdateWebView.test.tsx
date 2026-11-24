import { render, screen } from '@testing-library/react'
import { UpdateWebView } from './UpdateWebView'

const ua = vi.hoisted(() => ({ native: false }))
vi.mock('@capacitor/core', async (orig) => ({
  ...(await orig<typeof import('@capacitor/core')>()),
  Capacitor: { isNativePlatform: () => ua.native },
}))

describe('the app on a too-old Android System WebView', () => {
  it('is told apart from the website by the app’s own mark, and only when the bridge didn’t start', async () => {
    const { appShellWithoutBridge } = await import('../lib/platform')
    const agent = vi.spyOn(navigator, 'userAgent', 'get')
    agent.mockReturnValue('Mozilla/5.0 (Linux; Android 9) Chrome/70 Mobile ClozestAndroidApp')
    expect(appShellWithoutBridge()).toBe(true)
    ua.native = true
    expect(appShellWithoutBridge()).toBe(false)
    ua.native = false
    agent.mockReturnValue('Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile')
    expect(appShellWithoutBridge()).toBe(false)
    agent.mockRestore()
  })

  it('shows one screen with the way to update it', () => {
    render(<UpdateWebView />)
    expect(screen.getByRole('heading', { name: 'Update one app to continue' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Update in Play Store' })).toHaveAttribute(
      'href',
      'https://play.google.com/store/apps/details?id=com.google.android.webview',
    )
  })
})
