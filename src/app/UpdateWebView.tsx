import { ContactUs } from '../components/ContactUs'
import { useT } from '../i18n'

/** The Play Store app on a phone whose Android System WebView is too old for it: one screen, one button to fix it. */
export function UpdateWebView() {
  const t = useT()
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6 text-center">
      <h1 className="font-display text-2xl font-bold">{t('app.webViewOldTitle')}</h1>
      <p className="text-muted">{t('app.webViewOldBody')}</p>
      {/* A plain link: the app hands play.google.com to the Play Store app */}
      <a
        href="https://play.google.com/store/apps/details?id=com.google.android.webview"
        className="inline-flex min-h-12 items-center justify-center rounded-xl bg-brand px-5 font-semibold text-brand-ink"
      >
        {t('app.webViewOldButton')}
      </a>
      <UpdateHelp screen={t('app.webViewOldTitle')} />
    </main>
  )
}

/**
 * Under a screen that blocks the app until something is updated (this one, and "Please update the app"): Call us /
 * WhatsApp us. Plain links: the router may not be there. (No "use the website meanwhile": both screens show only in
 * the Play Store app, where partner.clozest.in opens the app's own screens again, and the app has no way to hand a
 * link to Chrome.)
 */
export function UpdateHelp({ screen }: { screen: string }) {
  const t = useT()
  return (
    <div className="flex flex-col gap-4 pt-2">
      <ContactUs screen={screen} heading={t('help.talkToUs')} />
    </div>
  )
}
