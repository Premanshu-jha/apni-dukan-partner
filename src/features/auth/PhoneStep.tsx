import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { authApi } from '../../api/auth'
import { isApiError, messageOf } from '../../api/errors'
import { Banner, Button, Field, Page } from '../../components/ui'
import { Turnstile } from '../../components/Turnstile'
import { language, languageChosen, setLanguage, useT } from '../../i18n'
import { LanguagePicker } from '../../i18n/LanguagePicker'
import { TURNSTILE_SITE_KEY } from '../../lib/config'
import { formatPhone, normalizePhone } from '../../lib/phone'
import { takePhoneMove } from '../../lib/phoneMoved'
import { LegalLinks } from '../legal/LegalPage'
import { Brand } from './Brand'

export function PhoneStep() {
  const t = useT()
  const navigate = useNavigate()
  const deleted = Boolean((useLocation().state as { deleted?: boolean } | null)?.deleted)
  // A phone change whose answer was lost and which ended the session: it most likely went through
  const [movedTo] = useState(takePhoneMove)
  const [phone, setPhone] = useState(movedTo ?? '')
  const [captcha, setCaptcha] = useState<string | null>(null)
  const [resetKey, setResetKey] = useState(0)
  // What went wrong, worded when drawn (so it follows a language change)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  const normalized = normalizePhone(phone)
  const needsCaptcha = Boolean(TURNSTILE_SITE_KEY)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!normalized) {
      setError('phoneInvalid')
      return
    }
    setBusy(true)
    setError(null)
    // Signing in with the language on screen keeps it: the app doesn't offer the languages again afterwards
    if (!languageChosen()) void setLanguage(language())
    try {
      await authApi.sendCode(normalized, captcha)
      navigate('/signin/code', { state: { phone: normalized } })
    } catch (err) {
      setError(err)
      // A robot-check token works once; any failure needs a fresh one.
      if (needsCaptcha || isApiError(err, 'CAPTCHA_FAILED') || isApiError(err, 'CAPTCHA_REQUIRED')) setResetKey((k) => k + 1)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page>
      <Brand subtitle={t('auth.phoneSubtitle')} />
      {/* Before anything is typed: each language in its own script, for someone who can't read the one showing */}
      <LanguagePicker heading />
      {deleted && <Banner tone="info">{t('auth.phoneDeleted')}</Banner>}
      {movedTo && (
        <Banner tone="info">
          {t('auth.phoneMoved', { phone: formatPhone(movedTo) })}
        </Banner>
      )}
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field
          id="phone"
          label={t('auth.phoneLabel')}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder={t('auth.phonePlaceholder')}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          hint={t('auth.phoneHint')}
        />
        <Turnstile onToken={setCaptcha} resetKey={resetKey} />
        {error !== null && (
          <Banner tone="bad">{error === 'phoneInvalid' ? t('auth.phoneInvalid') : messageOf(error)}</Banner>
        )}
        <Button type="submit" busy={busy} disabled={!normalized || (needsCaptcha && !captcha)}>
          {t('auth.phoneSendCode')}
        </Button>
      </form>
      <p className="mt-2 text-center text-sm text-muted">
        {t('auth.phoneLost')}{' '}
        <Link to="/signin/recover" className="text-link underline">
          {t('auth.phoneRecoverLink')}
        </Link>
      </p>
      <div className="mt-auto pt-6">
        <LegalLinks />
      </div>
    </Page>
  )
}
