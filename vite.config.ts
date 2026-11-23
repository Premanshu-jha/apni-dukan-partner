import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { caddyHeaders, securityHeaders } from './security-headers.ts'

/** Writes the security headers into the build, for the Caddyfile (how Railway serves the site). */
function securityHeadersFile(headers: Record<string, string>): Plugin {
  return {
    name: 'security-headers-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'security-headers.caddy', source: caddyHeaders(headers) })
    },
  }
}

/**
 * The Play Store app's build (APP_BUILD=true, made by CI for Android): without viewport-fit=cover, so Capacitor keeps
 * the app below Android's status bar and above its navigation bar (an Android 15+ app is otherwise drawn under them);
 * without the web manifest (the app is installed from the Play Store, not from the browser); and with the website's
 * Content-Security-Policy as a meta tag (no server sends headers inside the app; frame-ancestors only works as a
 * header, so it is left out). The website's build is unchanged.
 */
function appIndexHtml(headers: Record<string, string>): Plugin {
  const csp = headers['Content-Security-Policy']
    .split('; ')
    .filter((d) => !d.startsWith('frame-ancestors'))
    .join('; ')
  return {
    name: 'app-index-html',
    apply: 'build',
    transformIndexHtml(html) {
      return html
        .replace(', viewport-fit=cover', '')
        .replace(/\s*<link rel="manifest"[^>]*>/, '')
        .replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`)
    },
  }
}

/**
 * https://partner.clozest.in/.well-known/assetlinks.json, the proof Android checks before it opens links to the website
 * in the Play Store app (AndroidManifest.xml's autoVerify): the app's id and its signing key's SHA-256 fingerprint,
 * from Play Console › App integrity (ANDROID_CERT_SHA256, set where the website is built; several, comma-separated).
 * Not set: no file, and links simply open in the browser.
 */
function assetLinks(fingerprints: string | undefined, appId: string): Plugin {
  const prints = (fingerprints ?? '').split(',').map((f) => f.trim().toUpperCase()).filter(Boolean)
  return {
    name: 'asset-links',
    apply: 'build',
    generateBundle() {
      if (prints.length === 0) return
      const links = [{
        relation: ['delegate_permission/common.handle_all_urls'],
        target: { namespace: 'android_app', package_name: appId, sha256_cert_fingerprints: prints },
      }]
      this.emitFile({ type: 'asset', fileName: '.well-known/assetlinks.json', source: JSON.stringify(links, null, 2) + '\n' })
    },
  }
}

export default defineConfig(({ mode }) => {
  // The build's settings (.env files and the host's variables), the same ones the app is built with
  const env = loadEnv(mode, process.cwd(), '')
  const headers = securityHeaders(env)
  return {
    plugins: [react(), tailwindcss(), securityHeadersFile(headers), assetLinks(env.ANDROID_CERT_SHA256, 'com.clozest.partner'), ...(process.env.APP_BUILD === 'true' ? [appIndexHtml(headers)] : [])],
    server: { port: 5174 },
    // The built site as Railway serves it (the dev server leaves them out: hot reload needs inline scripts)
    preview: { headers },
  }
})
