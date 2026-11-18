// npm audit, failing the build on any high or critical advisory except the few listed here on purpose.
// An advisory is listed only when no fixed version exists yet and the package never reaches the phone (build and
// test tools). Each has a reason and a date to look again; past that date it fails the build again.
import { execFileSync } from 'node:child_process'

const ALLOWED = {
  // picomatch <=4.0.7 (no fixed version as of 2026-11-18): a slow glob pattern (ReDoS). Used only by vite and
  // vitest on our own file paths at build/test time; the app shipped to phones doesn't contain it.
  'GHSA-fc5q-39xc-vjpf': { until: '2026-12-31' },
}

let report
try {
  report = execFileSync('npm', ['audit', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
} catch (e) {
  report = e.stdout // npm audit exits 1 when it finds anything
}
const parsed = JSON.parse(report)
// npm couldn't ask the registry (offline, its error answer): no report means the build can't say it's safe
if (parsed.error || !parsed.vulnerabilities) {
  console.error(`npm audit gave no report: ${parsed.error?.summary || parsed.message || 'the audit request failed'}`)
  process.exit(1)
}
const { vulnerabilities } = parsed
const today = new Date().toISOString().slice(0, 10)
const failing = []
for (const [name, v] of Object.entries(vulnerabilities)) {
  if (v.severity !== 'high' && v.severity !== 'critical') continue
  // An advisory of its own, or high only through another package's (listed under that package)
  const own = v.via.filter((x) => typeof x === 'object')
  const blocking = own.filter((x) => {
    const id = String(x.url ?? '').split('/').pop()
    const allowed = ALLOWED[id]
    return !(allowed && today <= allowed.until) && (x.severity === 'high' || x.severity === 'critical')
  })
  if (blocking.length) failing.push(`${name}: ${blocking.map((x) => `${x.title} (${x.url})`).join('; ')}`)
}
for (const [id, a] of Object.entries(ALLOWED)) {
  if (today <= a.until) console.log(`Allowed until ${a.until}: ${id}`)
}
if (failing.length) {
  console.error(`High or critical advisories:\n${failing.join('\n')}`)
  process.exit(1)
}
console.log('No high or critical advisories outside the allowed list.')
