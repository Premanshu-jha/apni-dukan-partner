// Asks a running production server (Caddy with this repo's Caddyfile, as Railway runs it) for the app's pages and
// checks the security headers on every answer. CI builds with VITE_API_URL=https://api.example.com and a Turnstile
// key, starts Caddy, then runs: node scripts/check-headers.mjs http://localhost:8080
const base = process.argv[2] ?? 'http://localhost:8080'
const API = 'https://api.example.com'
const TURNSTILE = 'https://challenges.cloudflare.com'
// What this app may use (Permissions-Policy)
const ALLOWED = ['geolocation=(self)']
const DENIED = ['camera=()', 'microphone=()', 'payment=()']

const failures = []
const check = (ok, what) => {
  if (!ok) failures.push(what)
}

async function headersOf(path) {
  const res = await fetch(base + path, { redirect: 'manual' })
  const body = await res.text()
  check(res.status === 200, `${path}: status ${res.status}`)
  const h = (name) => res.headers.get(name) ?? ''
  const csp = h('content-security-policy')
  const directive = (name) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? ''
  check(directive('default-src') === "default-src 'self'", `${path}: default-src is "${directive('default-src')}"`)
  check(directive('frame-ancestors') === "frame-ancestors 'none'", `${path}: frame-ancestors is "${directive('frame-ancestors')}"`)
  check(directive('script-src') === `script-src 'self' ${TURNSTILE}`, `${path}: script-src is "${directive('script-src')}"`)
  check(directive('connect-src') === `connect-src 'self' ${API}`, `${path}: connect-src is "${directive('connect-src')}"`)
  check(directive('object-src') === "object-src 'none'", `${path}: object-src is "${directive('object-src')}"`)
  check(directive('worker-src') === "worker-src 'self'", `${path}: worker-src is "${directive('worker-src')}"`)
  check(!csp.includes('unsafe-eval'), `${path}: CSP allows eval`)
  // The location pin's map tiles (OpenStreetMap's, the build sets no VITE_MAP_TILES)
  check(directive('img-src').includes('https://tile.openstreetmap.org'), `${path}: img-src is "${directive('img-src')}"`)
  const maxAge = Number(/max-age=(\d+)/.exec(h('strict-transport-security'))?.[1] ?? 0)
  check(maxAge >= 31536000, `${path}: Strict-Transport-Security is "${h('strict-transport-security')}"`)
  check(h('referrer-policy') === 'strict-origin-when-cross-origin', `${path}: Referrer-Policy is "${h('referrer-policy')}"`)
  check(h('x-content-type-options') === 'nosniff', `${path}: X-Content-Type-Options is "${h('x-content-type-options')}"`)
  const permissions = h('permissions-policy').split(',').map((p) => p.trim())
  for (const p of [...ALLOWED, ...DENIED]) check(permissions.includes(p), `${path}: Permissions-Policy lacks ${p}`)
  check(h('server') === '', `${path}: Server header "${h('server')}"`)
  return { res, body }
}

const home = await headersOf('/')
check(home.body.includes('<div id="root">'), '/: not the app')
// A deep link is the single-page app too, with the same headers
const deep = await headersOf('/salon/day')
check(deep.body.includes('<div id="root">'), '/salon/day: not the app')
const sw = await headersOf('/sw.js')
check(/javascript/.test(sw.res.headers.get('content-type') ?? ''), '/sw.js: not served as JavaScript')
await headersOf('/manifest.webmanifest')
await headersOf('/offline.html')
// The build's header file is not served (Caddy hides it: 404)
const hidden = await (await fetch(base + '/security-headers.caddy')).text()
check(!hidden.includes('Content-Security-Policy'), '/security-headers.caddy is served')
const health = await fetch(base + '/health')
check(health.status === 200, `/health: status ${health.status}`)

if (failures.length) {
  console.error(`Security headers: ${failures.length} problem(s)\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('Security headers: all present on every page')
