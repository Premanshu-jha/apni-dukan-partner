import { storage } from './storage'

/** Registration typing kept on this phone before the first save, tagged with who typed it. */
const KEY = 'adp.registerDraft'

export function saveRegisterDraft(userId: string, form: object) {
  storage.setJson(KEY, { userId, form })
}

/** The kept typing, only if it is this person's (a shared phone must not hand one owner's details to the next). */
export function loadRegisterDraft<T>(userId: string | undefined): Partial<T> | null {
  const d = storage.getJson<{ userId: string; form: Partial<T> }>(KEY)
  return d && userId && d.userId === userId ? d.form : null
}

export function forgetRegisterDraft() {
  storage.remove(KEY)
}

/** What the person said they run ("What do you run?"), kept until the shop is saved (then the shop says it). */
const KIND_KEY = 'adp.registerKind'

export function saveRegisterKind(userId: string, kind: 'KIRANA' | 'SALON') {
  storage.setJson(KIND_KEY, { userId, kind })
}

/** The kind picked on this phone, only if it was this person's. */
export function loadRegisterKind(userId: string | undefined): 'KIRANA' | 'SALON' | null {
  const d = storage.getJson<{ userId: string; kind: 'KIRANA' | 'SALON' }>(KIND_KEY)
  return d && userId && d.userId === userId && (d.kind === 'KIRANA' || d.kind === 'SALON') ? d.kind : null
}

export function forgetRegisterKind() {
  storage.remove(KIND_KEY)
}
