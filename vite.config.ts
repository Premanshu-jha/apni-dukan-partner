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

export default defineConfig(({ mode }) => {
  // The build's settings (.env files and the host's variables), the same ones the app is built with
  const headers = securityHeaders(loadEnv(mode, process.cwd(), ''))
  return {
    plugins: [react(), tailwindcss(), securityHeadersFile(headers)],
    server: { port: 5174 },
    // The built site as Railway serves it (the dev server leaves them out: hot reload needs inline scripts)
    preview: { headers },
  }
})
