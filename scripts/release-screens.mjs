// Sends the app's screens (dist/, the website built for the app by `npm run android`) to the backend as a screen
// update for the Play Store app: CI runs it after every merge to main (.github/workflows/ci.yml, android job). See
// "App updates" in the README.
//
//   1. zips dist/ and signs it with the app's private key (Capgo's CLI, offline: nothing goes to Capgo), so the app
//      installs it only if it was signed with our key
//   2. asks the backend for a one-time upload link (POST /api/v1/app-releases/<app>, the app's release token)
//   3. sends the zip straight to storage, then says it's done (POST .../<build>/publish): phones get it the next time
//      they open the app
//
// Needs: APP_RELEASE_TOKEN and CAPGO_PRIVATE_KEY (GitHub secrets), VITE_API_URL, ANDROID_VERSION_CODE (the run
// number: the APK of this run carries the same one), GITHUB_SHA. Without the secrets it says so and does nothing.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const APP = 'partner'
const APP_ID = 'com.clozest.partner'

const token = process.env.APP_RELEASE_TOKEN?.trim()
const privateKey = process.env.CAPGO_PRIVATE_KEY?.trim()
const api = process.env.VITE_API_URL?.replace(/\/$/, '')
const build = Number(process.env.ANDROID_VERSION_CODE)
const commit = (process.env.GITHUB_SHA ?? '').slice(0, 40)

if (!token || !privateKey) {
  console.log('::notice title=Screen updates::APP_RELEASE_TOKEN or CAPGO_PRIVATE_KEY not set: no screen update sent')
  process.exit(0)
}
if (!api || !Number.isInteger(build) || build < 1 || !/^[0-9a-f]{7,40}$/.test(commit)) {
  throw new Error('VITE_API_URL, ANDROID_VERSION_CODE and GITHUB_SHA are needed')
}

const nativeLevel = Number(readFileSync('android/native-level', 'utf8').trim())
const versionName = JSON.parse(readFileSync('package.json', 'utf8')).version

const work = mkdtempSync(join(tmpdir(), 'screens-'))
try {
  const keyFile = join(work, 'key')
  writeFileSync(keyFile, privateKey + '\n', { mode: 0o600 })
  const zip = join(work, 'screens.zip')
  // The CLI also checks the screens call notifyAppReady (else every phone would go back to its old screens)
  const zipped = capgo(['bundle', 'zip', APP_ID, '--path', 'dist', '--json', '--name', zip])
  // Signing writes the public key into the Capacitor config of the folder it runs in: run it in the work folder, on
  // a throwaway config, so the repo's capacitor.config.ts is never touched (the package.json says which updater the
  // app has, so the signed checksum is in the form that updater reads)
  writeFileSync(join(work, 'capacitor.config.json'), JSON.stringify({ appId: APP_ID, appName: APP, webDir: 'dist' }))
  const signed = capgo(
    ['bundle', 'encrypt', zip, zipped.checksum, '--key', keyFile, '--package-json', resolve('package.json'), '--json'],
    work,
  )
  const file = signed.filename
  const sizeBytes = statSync(file).size

  const started = await call('POST', `/api/v1/app-releases/${APP}`, {
    build,
    nativeLevel,
    versionName,
    commitSha: commit,
    sizeBytes,
    checksum: signed.checksum,
    sessionKey: signed.ivSessionKey,
  }).catch((e) => {
    // This run's screens were sent before (CI re-run with the same run number): nothing to do
    if (e.code === 'RELEASE_EXISTS') return null
    throw e
  })
  if (!started) {
    console.log(`::notice title=Screen updates::Build ${build} was already sent: nothing to do`)
  } else {
    await send(started, file, sizeBytes)
  }
} finally {
  // The key file and the zips never stay on the runner, whatever happened
  rmSync(work, { recursive: true, force: true })
}

async function send(started, file, sizeBytes) {
  await retry(async () => {
    const res = await fetch(started.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/zip' },
      body: readFileSync(file),
    })
    if (!res.ok) throw new Error(`Storage answered ${res.status}`)
  })
  const published = await call('POST', `/api/v1/app-releases/${APP}/${build}/publish`)
  console.log(`Screen update ${build} (native level ${nativeLevel}, ${sizeBytes} bytes): ${published.status}`)
}

function capgo(args, cwd = process.cwd()) {
  const out = execFileSync(resolve('node_modules/.bin/capgo'), args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, CI: '1' },
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  // The JSON is the last thing printed
  return JSON.parse(out.slice(out.lastIndexOf('\n{') + 1))
}

async function call(method, path, body) {
  return retry(async () => {
    const res = await fetch(api + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Release-Token': token },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    if (!res.ok) {
      const error = new Error(`${method} ${path}: ${res.status} ${text}`)
      // Only a busy or unreachable backend is worth another try; a refusal is final
      error.final = res.status < 500
      try {
        error.code = JSON.parse(text).code
      } catch {
        // not JSON: no code
      }
      throw error
    }
    return JSON.parse(text)
  })
}

async function retry(task) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await task()
    } catch (e) {
      if (e.final || attempt === 3) throw e
      await new Promise((r) => setTimeout(r, attempt * 5000))
    }
  }
}
