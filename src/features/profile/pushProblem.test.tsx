import { fireEvent, render, screen } from '@testing-library/react'
import { t } from '../../i18n'
import { PushProblem, pushErrorText } from './Notifications'

const fake = vi.hoisted(() => ({ app: true, open: vi.fn(async () => {}) }))

vi.mock('../../lib/platform', () => ({ isApp: () => fake.app }))
vi.mock('../../api/appPush', async (orig) => ({
  ...(await orig<typeof import('../../api/appPush')>()),
  openNotificationSettings: () => fake.open(),
}))

describe('what a notifications switch says when it can’t turn on', () => {
  it('turned off in Android’s settings: the line, and one tap to those settings (the app only)', () => {
    fake.app = true
    const { unmount } = render(<PushProblem text={t('profile.pushDeniedApp')} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }))
    expect(fake.open).toHaveBeenCalled()
    unmount()
    fake.app = false
    render(<PushProblem text={t('profile.pushDenied')} />)
    expect(screen.queryByRole('button', { name: 'Open settings' })).toBeNull()
  })

  it('no token from Firebase (a phone without Google services) says so in plain words', () => {
    expect(pushErrorText(new Error('push-timeout'))).toMatch(/couldn't connect for notifications/)
    expect(pushErrorText(new Error('push-registration'))).toMatch(/couldn't connect for notifications/)
  })
})
