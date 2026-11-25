// CI check (.github/workflows/ci.yml): a change to the app's native part must raise android/native-level.
//
// Screen updates (see "App updates" in the README) are offered only to apps whose native level is at least the one
// the screens were built with. If native code changes and the level stays, new screens would reach older apps that
// don't have that code, and break there. So this check fails when, compared with the base (the PR's target, or the
// commit before a push), any of these changed and android/native-level did not go up:
//   - the app's own native files: android/app/src/main/** (Java, AndroidManifest.xml, res/), the Gradle files
//     (android/**/*.gradle), and capacitor.config.ts (copied into the app at build time)
//   - a native plugin (any installed package with an android/ folder, or a "capacitor" entry in its package.json)
//     added, removed, or moved to another major or minor version (package-lock.json): a minor version may add native
//     methods new screens would call. Patch updates change no API, so they need no raise (Dependabot stays green).
//
// Usage: node scripts/check-native-level.mjs <base ref or sha>
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const base = process.argv[2]
if (!base || /^0+$/.test(base)) {
  console.log('No base to compare with: nothing to check')
  process.exit(0)
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const atBase = (path) => {
  try {
    return git('show', `${base}:${path}`)
  } catch {
    return null
  }
}

const changed = git('diff', '--name-only', `${base}...HEAD`).split('\n').filter(Boolean)
const reasons = changed.filter(
  (f) =>
    (f.startsWith('android/app/src/main/') && !f.startsWith('android/app/src/main/assets/')) ||
    (f.startsWith('android/') && f.endsWith('.gradle')) ||
    f === 'capacitor.config.ts',
)

// Native plugins: installed packages that carry Android code
const isNativePlugin = (name) => {
  if (name === '@capacitor/cli') return false
  if (existsSync(`node_modules/${name}/android`)) return true
  try {
    return Boolean(JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8')).capacitor)
  } catch {
    return false
  }
}
// Exact versions from the lock file (top-level packages only)
const locked = (json) => {
  const lock = JSON.parse(json)
  return Object.fromEntries(
    Object.entries(lock.packages ?? {})
      .filter(([path]) => /^node_modules\/(@[^/]+\/)?[^/]+$/.test(path))
      .map(([path, p]) => [path.slice('node_modules/'.length), p.version]),
  )
}
const minor = (v) => String(v ?? '').split('.').slice(0, 2).join('.')
const before = locked(atBase('package-lock.json') ?? '{}')
const now = locked(readFileSync('package-lock.json', 'utf8'))
for (const name of new Set([...Object.keys(before), ...Object.keys(now)])) {
  // A removed package can't be looked at any more: judged by its name
  const native = name in now ? isNativePlugin(name) : /capacitor|capgo|capawesome/.test(name)
  if (!native) continue
  if (!(name in before)) reasons.push(`${name} added`)
  else if (!(name in now)) reasons.push(`${name} removed`)
  else if (minor(before[name]) !== minor(now[name])) reasons.push(`${name} ${before[name]} → ${now[name]}`)
}

const levelBefore = Number((atBase('android/native-level') ?? '0').trim())
const levelNow = Number(readFileSync('android/native-level', 'utf8').trim())
if (!Number.isInteger(levelNow) || levelNow < 1) {
  console.error('android/native-level must be a whole number, 1 or more')
  process.exit(1)
}
if (levelNow < levelBefore) {
  console.error(`android/native-level went down (${levelBefore} → ${levelNow}): it may only go up`)
  process.exit(1)
}
if (reasons.length && levelNow === levelBefore) {
  console.error(
    `The app's native part changed, so raise android/native-level (now ${levelNow}) by 1:\n  ` + reasons.join('\n  '),
  )
  process.exit(1)
}
console.log(reasons.length ? `Native part changed; level raised ${levelBefore} → ${levelNow}` : 'Native part unchanged')
