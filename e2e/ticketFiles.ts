import type { Route } from '@playwright/test'

/** A file on a message, as the backend shows it (TicketService.MessageFile). */
export interface ShownFile {
  id: string
  contentType: string
  sizeBytes: number
  name: string | null
  url: string | null
  removed: boolean
}

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

/**
 * Support files as the backend handles them (TicketFileService, TicketService.attach): a photo or PDF posted here, a
 * video PUT to a one-time link on the fake R2 then completed; sent with a message by id, once, by whoever sent it up.
 */
export class TicketFilesMock {
  files = new Map<string, { owner: string; contentType: string; sizeBytes: number; name: string | null; sent: boolean }>()
  videos = new Map<string, { owner: string; contentType: string; sizeBytes: number; put: boolean }>()
  /** The next upload of a photo or PDF fails with this, once. */
  failNext: { status: number; code: string; message: string } | null = null
  /** The next video PUT is held this long (to see the progress). */
  putDelayMs = 0
  private n = 0

  constructor(
    private readonly api: string,
    private readonly media: string,
  ) {}

  /** Answers the support-file calls (and serves their media); false for anything else. */
  async handle(route: Route, url: URL, method: string, userId: string, cors: Record<string, string>): Promise<boolean> {
    const p = url.pathname.replace('/api/v1', '')
    const json = async (status: number, body: unknown) => {
      await route.fulfill({ status, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      return true
    }
    if (url.origin === this.media && (p.startsWith('/ticket-media/'))) {
      const video = p.endsWith('.mp4')
      await route.fulfill({ status: 200, headers: { ...cors, 'Content-Type': video ? 'video/mp4' : p.endsWith('.pdf') ? 'application/pdf' : 'image/png' }, body: video ? Buffer.alloc(0) : PNG })
      return true
    }
    if (url.origin !== this.api) return false
    if (p === '/files/ticket' && method === 'POST') {
      if (this.failNext) {
        const f = this.failNext
        this.failNext = null
        return json(f.status, { code: f.code, message: f.message })
      }
      const raw = route.request().postDataBuffer()?.toString('latin1') ?? ''
      const pdf = raw.includes('%PDF-') || /filename="[^"]*\.pdf"/i.test(raw)
      const name = /filename="([^"]*)"/.exec(raw)?.[1] ?? null
      const id = `tf${++this.n}`
      const f = { owner: userId, contentType: pdf ? 'application/pdf' : 'image/jpeg', sizeBytes: Math.max(1000, raw.length), name, sent: false }
      this.files.set(id, f)
      return json(201, { id, contentType: f.contentType, sizeBytes: f.sizeBytes, name })
    }
    if (p === '/files/ticket/videos' && method === 'POST') {
      const body = JSON.parse(route.request().postData() ?? '{}') as { sizeBytes: number; contentType: string }
      if (!['video/mp4', 'video/quicktime', 'video/webm'].includes(body.contentType)) return json(400, { code: 'UNSUPPORTED_FILE_TYPE', message: 'The video must be MP4, MOV or WebM' })
      if (body.sizeBytes > 100 * 1024 * 1024) return json(413, { code: 'FILE_TOO_LARGE', message: 'A video can be at most 100 MB (about 2 minutes). Send a shorter one.' })
      const id = `tv${++this.n}`
      this.videos.set(id, { owner: userId, contentType: body.contentType, sizeBytes: body.sizeBytes, put: false })
      return json(201, { uploadId: id, uploadUrl: `${this.api}/__r2t/${id}.mp4?X-Amz-Signature=fake`, contentType: body.contentType, sizeBytes: body.sizeBytes, expiresAt: new Date(Date.now() + 900_000).toISOString(), expiresInSeconds: 900 })
    }
    if (p.startsWith('/__r2t/')) {
      if (method === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: cors })
        return true
      }
      const id = p.split('/').pop()!.split('.')[0]
      const v = this.videos.get(id)
      if (method !== 'PUT' || !v) {
        await route.fulfill({ status: 403, headers: cors, body: '<Error>SignatureDoesNotMatch</Error>' })
        return true
      }
      if (this.putDelayMs) await new Promise((r) => setTimeout(r, this.putDelayMs))
      v.put = true
      await route.fulfill({ status: 200, headers: { ...cors, ETag: '"r2"' }, body: '' })
      return true
    }
    const done = p.match(/^\/files\/ticket\/videos\/([^/]+)\/complete$/)
    if (done && method === 'POST') {
      const v = this.videos.get(done[1])
      if (!v || v.owner !== userId) return json(404, { code: 'UPLOAD_NOT_FOUND', message: 'No such upload' })
      if (!v.put) return json(409, { code: 'UPLOAD_NOT_FINISHED', message: "The video hasn't arrived yet. Add it again." })
      const id = `tf${++this.n}`
      this.files.set(id, { owner: userId, contentType: v.contentType, sizeBytes: v.sizeBytes, name: null, sent: false })
      return json(200, { id, contentType: v.contentType, sizeBytes: v.sizeBytes, name: null })
    }
    return false
  }

  /** The files a message comes with (TicketService.attach): theirs, not sent before; else the error to answer. */
  take(ids: unknown, owner: string): ShownFile[] | { status: number; code: string; message: string } {
    const list = Array.isArray(ids) ? (ids as string[]) : []
    if (list.length > 5 || new Set(list).size !== list.length) return { status: 400, code: 'VALIDATION_FAILED', message: 'Some fields are not valid' }
    for (const id of list) {
      const f = this.files.get(id)
      if (!f || f.owner !== owner) return { status: 400, code: 'FILE_NOT_FOUND', message: 'A file you added is no longer there. Add it again.' }
      if (f.sent) return { status: 409, code: 'FILE_ALREADY_SENT', message: 'A file you added was sent already. Add it again to send it once more.' }
    }
    return list.map((id) => {
      const f = this.files.get(id)!
      f.sent = true
      const ext = f.contentType.startsWith('video/') ? 'mp4' : f.contentType === 'application/pdf' ? 'pdf' : 'png'
      return { id, contentType: f.contentType, sizeBytes: f.sizeBytes, name: f.name, url: `${this.media}/ticket-media/${id}.${ext}`, removed: false }
    })
  }
}
