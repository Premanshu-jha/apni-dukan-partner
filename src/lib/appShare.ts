import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { AppSettings } from './appSettings'

/**
 * Sharing in the Play Store app, through Android's own share sheet (the website uses the browser's navigator.share,
 * which the app's web view doesn't have). Resolves when the sheet closes; closing it without sending is not an error.
 */
export async function shareTextInApp(title: string, text: string): Promise<void> {
  try {
    await Share.share({ title, text, dialogTitle: title })
  } catch {
    /* closed without sending: nothing to say, the buttons are still there */
  }
}

/**
 * A picture (the salon's poster) through Android's share sheet: written to the app's cache first (the sheet shares
 * files, not memory), then offered to WhatsApp, a status, Drive, a printer app or "Save" with the message as its
 * caption. The cache is the phone's to clear; one file per name, written over each time. Resolves 'failed' when the
 * file couldn't be written (the phone full) or the sheet couldn't open; closing the sheet is not a failure.
 */
export async function sharePngInApp(blob: Blob, file: string, title: string, text: string): Promise<'done' | 'failed'> {
  let uri: string
  try {
    const data = await base64Of(blob)
    uri = (await Filesystem.writeFile({ path: file, data, directory: Directory.Cache })).uri
  } catch {
    return 'failed'
  }
  try {
    await Share.share({ title, text, files: [uri], dialogTitle: title })
    return 'done'
  } catch (e) {
    // Closed without sending: nothing to say
    return /cancel/i.test(e instanceof Error ? e.message : String(e)) ? 'done' : 'failed'
  }
}

/**
 * The poster saved in the phone's Pictures › Clozest (to print from the gallery). 'unsupported' on Android 9 and
 * older (the share sheet is the way there).
 */
export async function savePngInApp(blob: Blob, file: string): Promise<'saved' | 'unsupported' | 'failed'> {
  try {
    await AppSettings.savePicture({ data: await base64Of(blob), name: file })
    return 'saved'
  } catch (e) {
    return (e as { code?: unknown } | null)?.code === 'UNSUPPORTED' ? 'unsupported' : 'failed'
  }
}

/** The blob as base64 without the "data:...;base64," prefix (what Filesystem.writeFile takes). */
export function base64Of(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      resolve(url.slice(url.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('read'))
    reader.readAsDataURL(blob)
  })
}
