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
