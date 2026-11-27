/**
 * The fake backend's kirana counter (`/api/v1/kirana`), following the backend's KiranaResponses and its rules (the
 * README's "The kirana counter"): who may do what, clientRef repeats, the khata limit, discounts, the day's totals.
 * Kept apart from MockApi (which routes to it) so the salon fake stays readable.
 */
type Json = Record<string, unknown>
type Answer = (status: number, json?: unknown) => Promise<void>
type Fail = (status: number, code: string, message: string, details?: Json) => Promise<void>

export interface KiranaCaller {
  userId: string
  name: string
  role: 'OWNER' | 'HELPER' | 'BARBER'
  shopName: string
  /** A verified shop whose owner hasn't entered the phone code (EditUnlocks): its checked details are locked. */
  editLocked?: boolean
  /** The shop's status: Yes to "sells food?" after Submit needs an FSSAI licence that counts. */
  status?: string
}

const IST = 5.5 * 3600_000
const dayOf = (iso: string) => new Date(Date.parse(iso) + IST).toISOString().slice(0, 10)
const r2 = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

export class KiranaMock {
  upiId: string | null = null
  /** The registration answer: does the shop sell food (packed or loose)? null until answered. */
  sellsFood: boolean | null = null
  /** The FSSAI licence (GET /kirana/online's fssai). */
  fssai: Json = { status: 'NONE', number: null, fileId: null, reason: null, checkedAt: null, validUntil: null, currentValidUntil: null }
  products: Json[] = []
  bills: Json[] = []
  customers: Json[] = []
  entries: Json[] = []
  moves: Json[] = []
  /** clientRefs already used, with what they made. */
  private refs = new Map<string, Json>()
  private n = 0
  private billNo = 0
  /** Whether a file is one of this shop's REG_DOC uploads (set by MockApi, which keeps the files). */
  regDocFile: ((id: string) => boolean) | null = null
  /** Every bill call that reached the counter, to check retries and clientRefs. */
  billCalls: Json[] = []

  // ---------- the product setup after Submit (ProductSetupService, PhotoReads, ProductService.setPhoto) ----------
  /** "I've added all my products" (shops.products_ready_at); null until then. */
  setupReadyAt: string | null = null
  /** The list's pages (kirana_reads STOCK_LIST), in the order sent. */
  pages: Json[] = []
  /** Their lines (kirana_list_lines), as ListLineView with readId. */
  lines: Json[] = []
  /** What the next page sent reads as: its lines (wording, brand, name, size, byWeight, mrpPaise, quantity, suggestions), or a failure code. */
  nextPage: Json[][] = []
  nextPageFailure: string | null = null
  /** How many reads of the setup a page stays READING for (the AI's minute). */
  readingFor = 1
  /** What a product photo's check answers: OK (pictured), CHECKING (stays being checked) or a refusal code (REFUSED; NEED_SIZE). */
  photoAnswer: string = 'OK'
  /** Products added by hand get a picture at once (the shared catalogue's) unless a test says not. */
  newProductsPictured = true
  /** List pages sent today, deleted and failed ones too (ReadStore.listPagesSince: TOO_MANY_PAGES_TODAY at 100). */
  pagesSentToday = 0
  pagesPerDay = 100
  /** Every setup call, to check retries, paging and that nothing polls in a storm. */
  setupCalls: { method: string; path: string; body?: Json }[] = []

  /** A page already read, with these lines (each a ListLineView's read part). */
  listPage(lines: Json[], over: Json = {}): Json {
    const readId = `rd${++this.n}`
    const page: Json = { readId, fileId: `f${this.n}`, status: 'READ', failure: null, failureCode: null, linesLeftOut: 0, sentAt: new Date(Date.now() + this.n).toISOString(), recount: false, reads: 0, ...over }
    this.pages.push(page)
    lines.forEach((l, i) => this.lines.push(this.listLine(readId, i + 1, l)))
    return page
  }

  private listLine(readId: string, lineNo: number, l: Json): Json {
    return {
      id: `ln${++this.n}`, readId, lineNo, wording: 'Item', brand: null, name: null, size: null, byWeight: false, mrpPaise: null, quantity: null,
      status: 'NEW', productId: null, counted: null, suggestions: [], sure: false, autoCounted: false, countBefore: null, productName: null,
      stockNow: null, countPutBack: null, ...l,
    }
  }

  /** Pages that count towards the 60 kept (ReadStore.listPages: not failed, discarded or a recount). */
  private keptPages(): number {
    return this.pages.filter((x) => x.status !== 'FAILED' && !x.recount).length
  }

  /** Quantities.problem: a piece count is whole. */
  static pieceProblem(q: number, unit: unknown): string | null {
    return unit !== 'KG' && !Number.isInteger(q) ? 'must be a whole number for items sold by the piece' : null
  }

  private setupView(me: KiranaCaller): Json {
    // The reading job: a page READING for a while, then READ (its lines) or FAILED
    for (const pg of this.pages.filter((x) => x.status === 'READING')) {
      pg.reads = (pg.reads as number) + 1
      if ((pg.reads as number) <= this.readingFor) continue
      if (pg.failWith) Object.assign(pg, { status: 'FAILED', failureCode: pg.failWith, failure: 'This list could not be read.' })
      else {
        pg.status = 'READ'
        ;((pg.toRead as Json[]) ?? []).forEach((l, i) => this.lines.push(this.listLine(pg.readId as string, i + 1, l)))
      }
    }
    const active = this.products.filter((x) => x.active)
    const uncounted = active.filter((x) => !x.counted)
    const lines = (st: string) => this.lines.filter((l) => l.status === st).length
    const toCheck = lines('NEW')
    const reading = this.pages.filter((x) => x.status === 'READING').length
    const failed = this.pages.filter((x) => x.status === 'FAILED').length
    const missing = active.filter((x) => !x.pictured)
    const checking = missing.filter((x) => x.photoCheck === 'CHECKING').length
    // GS1 may still bring their picture (ProductStore.WAITING_FOR_GS1): nothing for the shop to do yet
    const finding = missing.filter((x) => x.finding && x.photoCheck !== 'CHECKING').length
    const refused = missing.filter((x) => x.photoCheck === 'REFUSED' || x.photoCheck === 'NEED_SIZE').length
    const ready = this.setupReadyAt
    const canFinish = !ready && active.length > 0 && uncounted.length === 0 && toCheck === 0 && reading === 0 && failed === 0 && missing.length === 0
    const step = active.length === 0 && toCheck === 0 && reading === 0 ? 'ADD'
      : toCheck > 0 || reading > 0 || failed > 0 ? 'LIST' : uncounted.length > 0 ? 'COUNT'
        : missing.length > checking + finding ? 'PHOTOS' : checking + finding > 0 ? 'WAIT' : 'FINISH'
    const beforeApproval = Boolean(ready) && me.status !== 'APPROVED' && (active.length === 0 || uncounted.length > 0 || missing.length > 0)
    const next = !ready ? step : toCheck > 0 || reading > 0 || failed > 0 ? 'LIST'
      : beforeApproval ? (active.length === 0 ? 'ADD' : uncounted.length > 0 ? 'COUNT' : missing.length > checking + finding ? 'PHOTOS' : 'WAIT') : 'DONE'
    const pageNo = new Map(this.pages.map((x, i) => [x.readId, i + 1]))
    return {
      readyAt: ready, products: active.length, uncounted: uncounted.length,
      uncountedProducts: uncounted.slice(0, 20).map((x) => ({ id: x.id, name: x.name })),
      linesToCheck: toCheck, linesAdded: lines('ADDED'), linesSkipped: lines('SKIPPED'), pagesReading: reading, pagesFailed: failed,
      pagesLeft: Math.max(0, 60 - this.keptPages()),
      pages: this.pages.map((x) => {
        const mine = this.lines.filter((l) => l.readId === x.readId)
        return {
          readId: x.readId, pageNo: pageNo.get(x.readId), fileId: x.fileId, status: x.status, failure: x.failure, linesLeftOut: x.linesLeftOut,
          linesToCheck: mine.filter((l) => l.status === 'NEW').length, linesAdded: mine.filter((l) => l.status === 'ADDED').length,
          linesSkipped: mine.filter((l) => l.status === 'SKIPPED').length, sentAt: x.sentAt, recount: x.recount, linesAutoCounted: 0, failureCode: x.failureCode,
        }
      }),
      photosMissing: missing.length, photosChecking: checking, photosRefused: refused, photosFinding: finding, photosLeftToday: 300,
      nextStep: next, canFinish, youCanFinish: canFinish && me.role === 'OWNER', beforeApproval,
    }
  }

  private lineView(l: Json): Json {
    const pageNo = this.pages.findIndex((x) => x.readId === l.readId) + 1
    const on = l.productId ? this.products.find((x) => x.id === l.productId) : null
    return { ...l, pageNo, productName: on?.name ?? null, stockNow: on?.stock ?? null, suggestions: l.status === 'NEW' ? l.suggestions : [] }
  }

  private async setupHandle(p: string, method: string, url: URL, body: Json | undefined, me: KiranaCaller, ok: Answer, fail: Fail): Promise<void> {
    this.setupCalls.push({ method, path: p + url.search, body })
    const bad = (field: string, message: string) => fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { [field]: message })
    if (p === '/kirana/setup' && method === 'GET') return ok(200, this.setupView(me))

    if (p === '/kirana/setup/lines' && method === 'GET') {
      this.setupView(me)
      const status = (url.searchParams.get('status') ?? 'NEW').toUpperCase()
      if (!['NEW', 'SKIPPED', 'ADDED'].includes(status)) return bad('status', 'Use NEW, SKIPPED or ADDED')
      const order = new Map(this.pages.map((x, i) => [x.readId, i]))
      const all = this.lines.filter((l) => l.status === status)
        .sort((a, b) => (order.get(a.readId)! - order.get(b.readId)!) || (a.lineNo as number) - (b.lineNo as number))
      const from = Number(url.searchParams.get('cursor') ?? 0) || 0
      return ok(200, { items: all.slice(from, from + 20).map((l) => this.lineView(l)), next: from + 20 < all.length ? String(from + 20) : null })
    }

    const line = p.match(/^\/kirana\/setup\/lines\/([^/]+)$/)
    if (line && method === 'POST') {
      const l = this.lines.find((x) => x.id === line[1])
      if (!l) return fail(404, 'LINE_NOT_FOUND', "This line of your list isn't there any more. Open your list again.")
      const added = () => fail(409, 'LINE_ADDED', 'This one is already added. To fix it, open the product and change it there.', { productId: l.productId })
      if (body?.action === 'SKIP') {
        if (l.status === 'ADDED') return added()
        l.status = 'SKIPPED'
        return ok(200, this.lineView(l))
      }
      if (body?.action === 'UNDO') {
        if (l.status === 'ADDED') return added()
        l.status = 'NEW'
        return ok(200, this.lineView(l))
      }
      if (body?.action !== 'ADD') return bad('action', 'Choose what to do')
      if (l.status === 'ADDED') return ok(200, this.lineView(l))   // sent again: the line as it is
      const q = body.quantity as number | undefined
      if (q === undefined || q === null || q < 0) return bad('quantity', 'Count how many are on the shelf (0 if none)')
      if (body.productId) {
        const x = this.products.find((y) => y.id === body.productId && y.active)
        if (!x) return bad('productId', 'Pick one of your products')
        const elsewhere = this.lines.some((y) => y !== l && y.status === 'ADDED' && y.productId === x.id)
        if (elsewhere && body.addToCount === undefined) {
          return fail(409, 'ALREADY_COUNTED', `${x.name} was already counted from your list: ${x.stock}. Add this count to it, or replace it?`, { productId: x.id, name: x.name, stock: x.stock })
        }
        const bad1 = KiranaMock.pieceProblem(q, x.unit)
        if (bad1) return bad('quantity', bad1)
        const to = body.addToCount ? Math.max(0, x.stock as number) + q : q
        if (to !== x.stock) this.move(x, to - (x.stock as number), 'COUNT', me, undefined, 'Product setup: from your list')
        x.counted = true
        Object.assign(l, { status: 'ADDED', productId: x.id, counted: q })
        return ok(200, this.lineView(l))
      }
      const item = body.itemId ? (l.suggestions as Json[]).find((s) => s.itemId === body.itemId) : null
      const name = String(body.name ?? item?.name ?? [l.brand, l.name, l.size].filter(Boolean).join(' ') ?? l.wording).trim() || String(l.wording)
      const price = (body.pricePaise as number | undefined) ?? (item ? (item.pricePaise as number | null) : (l.mrpPaise as number | null)) ?? null
      if (price === null) return bad('pricePaise', 'Enter the price')
      const taken = this.products.find((x) => x.active && (x.name as string).toLowerCase() === name.toLowerCase())
      if (taken) return fail(409, 'NAME_TAKEN', `You already have a product called "${taken.name}".`, { productId: taken.id, name: taken.name })
      // A catalogue item comes with its own unit (ProductService.newFor), else the one sent, else the line's reading
      const unit = body.unit ?? item?.unit ?? (l.byWeight ? 'KG' : 'PIECE')
      const bad2 = KiranaMock.pieceProblem(q, unit)
      if (bad2) return bad('quantity', bad2)
      const made = this.product({ name, unit, pricePaise: price, stock: q, counted: true, pictured: Boolean(item) })
      Object.assign(l, { status: 'ADDED', productId: made.id, counted: q })
      return ok(200, this.lineView(l))
    }

    if (p === '/kirana/setup/finish' && method === 'POST') {
      if (me.role !== 'OWNER') return fail(403, 'OWNER_ONLY', 'Only the shop owner can do this.')
      const v = this.setupView(me)
      if (this.setupReadyAt) return ok(200, v)
      if (!v.products) return fail(409, 'NO_PRODUCTS', 'Add your products first: everything you sell, with how many are on the shelf.')
      if ((v.linesToCheck as number) > 0 || (v.pagesReading as number) > 0) {
        return fail(409, 'LINES_TO_CHECK', (v.pagesReading as number) > 0 ? "A page of your list is still being read. Check its products when it's ready." : `Check the ${v.linesToCheck} products left from your list first: add them or skip them.`, { lines: v.linesToCheck, pagesReading: v.pagesReading })
      }
      if ((v.pagesFailed as number) > 0) return fail(409, 'PAGES_FAILED', "One page of your list couldn't be read. Take its photo again, or delete it if its products are added.", { pages: v.pagesFailed })
      if ((v.uncounted as number) === 0 && (v.photosMissing as number) > 0) {
        return fail(409, 'PHOTOS_NEEDED', `${v.photosMissing} products need a photo.`, { missing: v.photosMissing, checking: v.photosChecking, refused: v.photosRefused, finding: 0 })
      }
      if ((v.uncounted as number) > 0) return fail(409, 'PRODUCTS_NOT_COUNTED', `${v.uncounted} products have no count yet: count them first.`, { uncounted: v.uncounted, products: v.uncountedProducts })
      this.setupReadyAt = new Date().toISOString()
      return ok(200, this.setupView(me))
    }

    if (p === '/kirana/setup/photos' && method === 'GET') {
      const all = this.products.filter((x) => x.active && !x.pictured).sort((a, b) => (a.name as string).localeCompare(b.name as string))
      const from = Number(url.searchParams.get('cursor') ?? 0) || 0
      const size = (n: string) => /(\d+(?:\.\d+)?\s?(?:kg|g|ml|l))\b/i.exec(n)?.[1] ?? null
      return ok(200, {
        items: all.slice(from, from + 20).map((x) => ({
          productId: x.id, name: x.name, loose: x.unit === 'KG', sizeToShow: x.unit === 'KG' ? null : size(x.name as string), photoCheck: x.photoCheck,
          code: x.photoCode, reason: x.photoCode ? 'Not accepted' : null, seen: x.photoSeen ?? null, newPhotoUrl: null, findingPicture: Boolean(x.finding),
        })),
        next: from + 20 < all.length ? String(from + 20) : null,
      })
    }

    const photo = p.match(/^\/kirana\/products\/([^/]+)\/photo$/)
    if (photo && method === 'PUT') {
      const x = this.products.find((y) => y.id === photo[1])
      if (!x) return fail(404, 'PRODUCT_NOT_FOUND', 'No such product.')
      const ref = `photo:${body?.clientRef}`
      if (this.refs.has(ref)) return ok(200, x)
      if (!x.active) return fail(409, 'PRODUCT_REMOVED', 'This product was removed from your list.')
      if (!body?.fileId && body?.sizeFileId && x.photoCheck !== 'NEED_SIZE') return bad('fileId', 'Send the photo of the front with it')
      if (!body?.fileId && !body?.sizeFileId) return ok(200, x)
      this.refs.set(ref, x)
      const answer = this.photoAnswer
      if (answer === 'OK') Object.assign(x, { pictured: true, photoCheck: null, photoCode: null })
      else if (answer === 'CHECKING') Object.assign(x, { photoCheck: 'CHECKING', photoCode: null })
      else if (answer === 'NEED_SIZE' && !body.sizeFileId) Object.assign(x, { photoCheck: 'NEED_SIZE', photoCode: 'NEED_SIZE' })
      else if (answer === 'NEED_SIZE') Object.assign(x, { pictured: true, photoCheck: null, photoCode: null })
      else Object.assign(x, { photoCheck: 'REFUSED', photoCode: answer })
      return ok(200, x)
    }

    if (p === '/kirana/reads' && method === 'POST') {
      const ref = `read:${body?.clientRef}`
      const first = this.refs.get(ref)
      if (first) return ok(201, first)
      if (body?.kind !== 'STOCK_LIST') return bad('kind', 'Choose what the photo is')
      const ids = (body?.fileIds as string[] | undefined) ?? []
      if (ids.length !== 1) return bad('fileIds', 'Send one page')
      const recount = body?.recount === true
      if (!recount && this.keptPages() >= 60) return fail(409, 'TOO_MANY_PAGES', 'You have 60 pages of your list already. Add the rest of your products one by one, or delete a page you don\'t need.', { max: 60 })
      if (this.pagesSentToday >= this.pagesPerDay) return fail(409, 'TOO_MANY_PAGES_TODAY', `You've sent ${this.pagesPerDay} pages today. Send more tomorrow, or add the rest of your products one by one.`, { max: this.pagesPerDay })
      this.pagesSentToday++
      const readId = `rd${++this.n}`
      this.pages.push({ readId, fileId: ids[0], status: 'READING', failure: null, failureCode: null, linesLeftOut: 0, sentAt: new Date().toISOString(), recount, reads: 0, toRead: this.nextPage.shift() ?? [], failWith: this.nextPageFailure })
      this.nextPageFailure = null
      const view = { id: readId, kind: 'STOCK_LIST', status: 'READING', fileIds: ids, failure: null, purchaseId: null, billId: null, createdAt: new Date().toISOString(), updatedAt: null, recount, failureCode: null }
      this.refs.set(ref, view)
      return ok(201, view)
    }
    const discard = p.match(/^\/kirana\/reads\/([^/]+)\/discard$/)
    if (discard && method === 'POST') {
      const pg = this.pages.find((x) => x.readId === discard[1])
      if (!pg) return fail(404, 'READ_NOT_FOUND', 'No such photo.')
      this.pages = this.pages.filter((x) => x !== pg)
      this.lines = this.lines.filter((l) => !(l.readId === pg.readId && l.status !== 'ADDED'))
      return ok(200, { id: pg.readId, kind: 'STOCK_LIST', status: 'DISCARDED', fileIds: [pg.fileId], failure: null, createdAt: pg.sentAt, recount: false, failureCode: null })
    }
    return fail(404, 'NOT_FOUND', 'No such path.')
  }

  product(over: Json = {}): Json {
    const p: Json = {
      id: `kp${++this.n}`, name: 'Tata Salt 1 kg', barcodes: [], unit: 'PIECE', pricePaise: 2800, stock: 10, lowStockAt: null,
      runningOut: false, active: true, version: 0, updatedAt: new Date().toISOString(), costPaise: null, photoFileId: null, photoUrl: null,
      // The product setup's own (not in ProductView): counted (kirana_products.counted_at) and a picture it has
      counted: true, pictured: true, photoCheck: null, photoCode: null,
      ...over,
    }
    this.products.push(p)
    this.refresh(p)
    return p
  }

  customer(over: Json = {}): Json {
    const c: Json = {
      id: `kc${++this.n}`, name: 'Sunita', phone: null, note: null, creditLimitPaise: 200000, balancePaise: 0, active: true,
      version: 0, updatedAt: new Date().toISOString(), ...over,
    }
    this.customers.push(c)
    return c
  }

  /** A khata customer as KhataCustomerView: owes, advance, available. */
  view(c: Json): Json {
    const bal = c.balancePaise as number
    const limit = c.creditLimitPaise as number | null
    return { ...c, owesPaise: Math.max(0, bal), advancePaise: Math.max(0, -bal), availablePaise: limit === null ? null : Math.max(0, limit - bal) }
  }

  private refresh(p: Json) {
    const low = p.lowStockAt as number | null
    p.runningOut = (p.stock as number) < 0 || (low !== null && (p.stock as number) <= low)
  }

  private move(p: Json, change: number, reason: string, by: KiranaCaller, bill?: Json, note?: string) {
    p.stock = Math.round(((p.stock as number) + change) * 1000) / 1000
    this.refresh(p)
    this.moves.unshift({ productId: p.id, change, stockAfter: p.stock, reason, billId: bill?.id ?? null, billNo: bill?.billNo ?? null, note: note ?? null, byName: by.name, at: new Date().toISOString() })
  }

  private entry(c: Json, kind: string, amountPaise: number, by: KiranaCaller, extra: Json = {}): Json {
    c.balancePaise = (c.balancePaise as number) + amountPaise
    c.version = (c.version as number) + 1
    const e: Json = { id: `ke${++this.n}`, customerId: c.id, kind, amountPaise, balanceAfter: c.balancePaise, billId: null, billNo: null, method: null, note: null, reversesId: null, reversed: false, byName: by.name, byId: by.userId, at: new Date().toISOString(), ...extra }
    this.entries.unshift(e)
    return e
  }

  private upi(amount: number, billNo: number, shopName: string): Json | null {
    if (!this.upiId) return null
    return { upiId: this.upiId, payeeName: shopName, amountPaise: amount, uri: `upi://pay?pa=${this.upiId}&pn=${encodeURIComponent(shopName)}&am=${(amount / 100).toFixed(2)}&cu=INR&tn=Bill%20${billNo}` }
  }

  private summary(b: Json): Json {
    const lines = b.lines as Json[]
    return {
      id: b.id, billNo: b.billNo, totalPaise: b.totalPaise, discountPaise: b.discountPaise, payment: b.payment,
      khataCustomerName: (b.khataCustomer as Json | null)?.name ?? null, paidNowPaise: b.paidNowPaise, lines: lines.length,
      preview: lines.slice(0, 3).map((l) => l.name).join(', '), createdAt: b.createdAt, voided: b.voidedAt !== null,
      refundedPaise: b.refundedPaise, paymentChanged: (b.changes as Json[]).length > 0,
    }
  }

  private billView(b: Json): Json {
    return { ...b }
  }

  async handle(p: string, method: string, url: URL, body: Json | undefined, me: KiranaCaller, ok: Answer, fail: Fail): Promise<void> {
    const owner = me.role === 'OWNER'
    const ownerOnly = () => fail(403, 'OWNER_ONLY', 'Only the shop owner can do this.')
    const bad = (field: string, message: string) => fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { [field]: message })
    if (me.role === 'BARBER') return fail(404, 'NO_SHOP', "You haven't registered or joined a shop yet.")

    // ---------- settings ----------
    const settings = (at: string | null = null) => ({ shopName: me.shopName, upiId: this.upiId, upiUpdatedAt: at, sellsFood: this.sellsFood })
    if (p === '/kirana/settings' && method === 'GET') return ok(200, settings())
    if (p === '/kirana/settings/upi-id' && method === 'PUT') {
      if (!owner) return ownerOnly()
      const upi = String(body?.upiId ?? '').replace(/\s+/g, '').toLowerCase()
      if (!/^[a-z0-9._-]{2,64}@[a-z][a-z0-9]{1,31}$/.test(upi)) return bad('upiId', 'must look like name@bank, e.g. sharmastore@okhdfcbank')
      if (upi !== this.upiId && me.editLocked) return fail(403, 'EDIT_LOCKED', "Your shop is verified: confirm it's you with the code we send to your phone first.")
      this.upiId = upi
      return ok(200, settings(new Date().toISOString()))
    }
    if (p === '/kirana/settings/sells-food' && method === 'PUT') {
      if (!owner) return ownerOnly()
      if (typeof body?.sellsFood !== 'boolean') return bad('sellsFood', 'must not be null')
      if (body.sellsFood !== this.sellsFood) {
        if (me.editLocked) return fail(403, 'EDIT_LOCKED', "Your shop is verified: confirm it's you with the code we send to your phone first.")
        const counts = this.fssai.status === 'CHECKING' || (this.fssai.status === 'VERIFIED' && !(this.fssai.validUntil && String(this.fssai.validUntil) < dayOf(new Date().toISOString())))
        if (body.sellsFood && me.status && me.status !== 'DRAFT' && !counts) {
          return fail(409, 'FSSAI_REQUIRED', 'A shop selling food needs its FSSAI licence: add it in Licences first, then change this.')
        }
      }
      this.sellsFood = body.sellsFood
      return ok(200, settings())
    }
    const online = () => ({
      takingOrders: false, ready: false, missing: ['APPROVAL', ...(this.upiId ? [] : ['UPI_ID']), ...(this.fssai.status === 'VERIFIED' ? [] : ['FSSAI'])],
      fssai: this.fssai, upiRecheck: false, rating: null, ratingCount: 0, duePaise: 0, laterPaise: 0, payouts: [],
    })
    if (p === '/kirana/online' && method === 'GET') return ok(200, online())
    if (p === '/kirana/online/fssai' && method === 'PUT') {
      if (!owner) return ownerOnly()
      const num = String(body?.number ?? '').replace(/[\s-]/g, '')
      if (!/^\d{14}$/.test(num)) return bad('number', 'An FSSAI number has 14 digits')
      if (!body?.fileId) return bad('fileId', 'Add a photo or the PDF of the certificate')
      if (this.regDocFile && !this.regDocFile(String(body.fileId))) return bad('fileId', 'Upload the certificate first')
      // The same licence again changes nothing; after a refusal it goes to a person
      if (num === this.fssai.number && body.fileId === this.fssai.fileId) {
        // OnlineService.setFssai / view: after a refusal, a person checks it (the reason says so)
        if (this.fssai.status === 'REJECTED') this.fssai = { ...this.fssai, status: 'CHECKING', reason: 'Our team is checking it, usually within a day.' }
        return ok(200, online())
      }
      this.fssai = { ...this.fssai, status: 'CHECKING', number: num, fileId: body.fileId, reason: null, checkedAt: null, validUntil: null }
      return ok(200, online())
    }

    if (p.startsWith('/kirana/setup') || p.startsWith('/kirana/reads') || /^\/kirana\/products\/[^/]+\/photo$/.test(p)) {
      return this.setupHandle(p, method, url, body, me, ok, fail)
    }

    // ---------- products ----------
    if (p === '/kirana/products' && method === 'GET') {
      const q = (url.searchParams.get('q') ?? '').toLowerCase()
      const list = this.products
        .filter((x) => !q || (x.name as string).toLowerCase().includes(q) || (x.barcodes as Json[]).some((b) => (b.code as string).startsWith(q)))
        .sort((a, b) => (a.name as string).localeCompare(b.name as string))
      const from = Number(url.searchParams.get('cursor') ?? 0) || 0
      return ok(200, { items: list.slice(from, from + 50), next: from + 50 < list.length ? String(from + 50) : null })
    }
    if (p === '/kirana/products/running-out') return ok(200, this.products.filter((x) => x.active && x.runningOut))
    if (p.startsWith('/kirana/products/barcode/')) {
      const code = decodeURIComponent(p.split('/').pop()!).trim().toUpperCase()
      for (const x of this.products.filter((y) => y.active)) {
        const b = (x.barcodes as Json[]).find((y) => y.code === code)
        if (b) return ok(200, { product: x, pack: b.pack })
      }
      return fail(404, 'PRODUCT_NOT_FOUND', 'No product has this barcode yet.')
    }
    if (p === '/kirana/products' && method === 'POST') {
      const name = String(body?.name ?? '').trim()
      if (name.length < 2) return bad('name', 'Use 2 to 100 letters')
      // A pack size without a barcode means nothing (ProductService.add)
      if (body?.pack !== undefined && body?.pack !== null && !body?.barcode) return bad('pack', 'Only with a barcode')
      // The barcode first, as the backend's requireFree does (stored in capitals: KiranaChecks.barcode)
      const code = body?.barcode ? String(body.barcode).trim().toUpperCase() : undefined
      if (code && !/^[A-Z0-9-]{4,32}$/.test(code)) return bad('barcode', 'Use 4 to 32 letters, digits or dashes')
      if (code) {
        const other = this.products.find((x) => x.active && (x.barcodes as Json[]).some((b) => b.code === code))
        if (other) return fail(409, 'BARCODE_TAKEN', `"${other.name}" already has this barcode.`, { productId: other.id, name: other.name })
      }
      const taken = this.products.find((x) => x.active && (x.name as string).toLowerCase() === name.toLowerCase())
      if (taken) return fail(409, 'NAME_TAKEN', `You already have a product called "${taken.name}".`, { productId: taken.id, name: taken.name })
      const made = this.product({ name, unit: body?.unit, pricePaise: body?.pricePaise, stock: 0, lowStockAt: body?.lowStockAt ?? null, barcodes: code ? [{ code, pack: body?.pack ?? 1 }] : [], counted: body?.stock !== undefined && body?.stock !== null, pictured: this.newProductsPictured })
      if (body?.stock) this.move(made, body.stock as number, 'COUNT', me)
      return ok(201, made)
    }
    const prod = p.match(/^\/kirana\/products\/([^/]+)(\/.*)?$/)
    if (prod) {
      const x = this.products.find((y) => y.id === prod[1])
      if (!x) return fail(404, 'PRODUCT_NOT_FOUND', 'No such product.')
      const rest = prod[2] ?? ''
      if (!rest && method === 'GET') return ok(200, { product: x, moves: this.moves.filter((m) => m.productId === x.id).slice(0, 50).map(({ productId: _p, ...m }) => m) })
      if (!rest && method === 'PATCH') {
        if (!owner) return ownerOnly()
        if (body?.version !== x.version) return fail(409, 'PRODUCT_CHANGED', 'Someone changed this product just now. Reload and try again.')
        if (body?.name !== undefined) {
          const other = this.products.find((y) => y !== x && y.active && (y.name as string).toLowerCase() === String(body.name).trim().toLowerCase())
          if (other) return fail(409, 'NAME_TAKEN', `You already have a product called "${other.name}".`, { productId: other.id, name: other.name })
        }
        if (body?.unit !== undefined && body.unit !== x.unit && this.moves.some((m) => m.productId === x.id && m.reason === 'SALE')) {
          return fail(409, 'PRODUCT_SOLD', "It was sold already: its unit can't change. Add a new product instead.")
        }
        for (const k of ['name', 'unit', 'pricePaise', 'lowStockAt', 'active']) if (body?.[k] !== undefined) x[k] = body[k]
        if (body?.noLowStockAlert) x.lowStockAt = null
        x.version = (x.version as number) + 1
        this.refresh(x)
        return ok(200, x)
      }
      const removed = () => fail(409, 'PRODUCT_REMOVED', 'This product was removed from your list.')
      if (rest === '/barcodes' && method === 'POST') {
        const code = String(body?.code ?? '').trim().toUpperCase()
        const other = this.products.find((y) => y !== x && y.active && (y.barcodes as Json[]).some((b) => b.code === code))
        if (other) return fail(409, 'BARCODE_TAKEN', `"${other.name}" already has this barcode.`, { productId: other.id, name: other.name })
        if (!x.active) return removed()
        const mine = (x.barcodes as Json[]).find((b) => b.code === code)
        if (mine && !owner && (body?.pack ?? 1) !== mine.pack) return fail(409, 'BARCODE_TAKEN', 'This barcode is already on it with another pack: ask the owner.', { productId: x.id, name: x.name })
        if (!mine && (x.barcodes as Json[]).length >= 10) return fail(409, 'TOO_MANY_BARCODES', 'A product has at most 10 barcodes.')
        if (mine) mine.pack = body?.pack ?? mine.pack
        else x.barcodes = [...(x.barcodes as Json[]), { code, pack: body?.pack ?? 1 }]
        x.version = (x.version as number) + 1
        return ok(200, x)
      }
      if (rest.startsWith('/barcodes/') && method === 'DELETE') {
        if (!owner) return ownerOnly()
        const code = decodeURIComponent(rest.split('/').pop()!).toUpperCase()
        if (!(x.barcodes as Json[]).some((b) => b.code === code)) return fail(404, 'BARCODE_NOT_FOUND', 'This product has no such barcode.')
        x.barcodes = (x.barcodes as Json[]).filter((b) => b.code !== code)
        x.version = (x.version as number) + 1
        return ok(200, x)
      }
      if (rest === '/stock' && method === 'POST') {
        const ref = `stock:${body?.clientRef}`
        if (this.refs.has(ref)) return ok(200, x)
        if (!x.active) return removed()
        const q = body?.quantity as number
        const unitBad = KiranaMock.pieceProblem(q, x.unit)
        if (unitBad) return bad('quantity', unitBad)
        // The clientRef is kept with the move it made (ProductService.changeStock): a count equal to the stock makes
        // none, so a retry with that id and another number is applied
        const moved = body?.reason !== 'COUNT' || q !== x.stock
        if (moved) this.refs.set(ref, x)
        if (body?.reason === 'RESTOCK') this.move(x, q, 'RESTOCK', me, undefined, body?.note as string)
        else if (body?.reason === 'DAMAGED') this.move(x, -q, 'DAMAGED', me, undefined, body?.note as string)
        else if (q !== x.stock) this.move(x, q - (x.stock as number), 'COUNT', me, undefined, body?.note as string)
        if (body?.reason === 'COUNT') x.counted = true
        return ok(200, x)
      }
    }

    // ---------- bills ----------
    if (p === '/kirana/bills' && method === 'POST') {
      this.billCalls.push(body ?? {})
      // BillService.bill: a helper's discount over ₹10 first, then a clientRef already used
      if (!owner && ((body?.discountPaise as number) ?? 0) > 1000) return fail(403, 'OWNER_ONLY', 'Only the owner can take more than ₹10 off a bill.')
      const ref = `bill:${body?.clientRef}`
      const first = this.refs.get(ref)
      if (first) return ok(200, { ...first, repeated: true })
      const lines: Json[] = []
      const gone: string[] = []
      for (const [i, l] of ((body?.lines as Json[]) ?? []).entries()) {
        if (l.productId) {
          const x = this.products.find((y) => y.id === l.productId && y.active)
          if (!x) {
            gone.push(l.productId as string)
            continue
          }
          const quantity = l.amountPaise ? Math.round(((l.amountPaise as number) / (x.pricePaise as number)) * 1000) / 1000 : (l.quantity as number)
          const amount = l.amountPaise ? (l.amountPaise as number) : Math.floor(((x.pricePaise as number) * Math.round(quantity * 1000) + 500) / 1000)
          lines.push({ lineNo: i + 1, productId: x.id, name: x.name, unit: x.unit, quantity, pricePaise: x.pricePaise, amountPaise: amount, returnedQuantity: 0 })
        } else {
          const listed = this.products.find((y) => y.active && (y.name as string).toLowerCase() === String(l.name).trim().toLowerCase())
          if (listed) return fail(409, 'ITEM_IN_LIST', `"${listed.name}" is in your list: scan or pick it.`, { line: i, productId: listed.id })
          const qty = (l.quantity as number) ?? 1
          lines.push({ lineNo: i + 1, productId: null, name: String(l.name).trim(), unit: 'PIECE', quantity: qty, pricePaise: l.amountPaise, amountPaise: (l.amountPaise as number) * qty, returnedQuantity: 0 })
        }
      }
      if (gone.length) return fail(409, 'PRODUCT_GONE', 'Some items were removed from your list meanwhile. Take them off the bill.', { productIds: gone })
      const subtotal = lines.reduce((t, l) => t + (l.amountPaise as number), 0)
      const discount = (body?.discountPaise as number) ?? 0
      if (discount > subtotal) return bad('discountPaise', 'The discount can be at most the bill')
      const total = subtotal - discount
      const payment = body?.payment as string
      const paidNow = (body?.paidNowPaise as number) ?? null
      let khata: Json | null = null
      if (payment === 'KHATA') {
        const c = this.customers.find((y) => y.id === body?.khataCustomerId && y.active)
        if (!c) return fail(404, 'KHATA_CUSTOMER_NOT_FOUND', 'No such khata customer.')
        if (paidNow !== null && paidNow >= total) return bad('paidNowPaise', 'Paid now must be less than the total')
        const onKhata = total - (paidNow ?? 0)
        const avail = this.view(c).availablePaise as number | null
        if (avail !== null && onKhata > avail) {
          return fail(409, 'KHATA_LIMIT', `${c.name} can buy ${r2(avail)} more on khata; this bill puts ${r2(onKhata)} on it. Take part now, bill fewer items, or ask the owner to raise the limit.`, { availablePaise: avail, limitPaise: c.creditLimitPaise, balancePaise: c.balancePaise })
        }
        khata = c
      }
      const bill: Json = {
        id: `kb${++this.n}`, billNo: ++this.billNo, subtotalPaise: subtotal, discountPaise: discount, totalPaise: total, payment,
        khataCustomer: khata ? { id: khata.id, name: khata.name } : null, paidNowPaise: payment === 'KHATA' ? paidNow : null,
        paidNowBy: payment === 'KHATA' && paidNow ? body?.paidNowBy : null, onKhataPaise: payment === 'KHATA' ? total - (paidNow ?? 0) : 0,
        refundedPaise: 0, version: 0, createdAt: new Date().toISOString(), byName: me.name, byId: me.userId, voidedAt: null, voidReason: null,
        lines, returns: [], changes: [], writtenOn: null, paperPhotoFileId: null,
      }
      const stock: Json[] = []
      for (const l of lines.filter((y) => y.productId)) {
        const x = this.products.find((y) => y.id === l.productId)!
        const before = x.stock
        this.move(x, -(l.quantity as number), 'SALE', me, bill)
        stock.push({ productId: x.id, name: x.name, unit: x.unit, before, after: x.stock, runningOut: x.runningOut })
      }
      if (khata) this.entry(khata, 'SALE', bill.onKhataPaise as number, me, { billId: bill.id, billNo: bill.billNo })
      this.bills.unshift(bill)
      const qrAmount = payment === 'UPI' ? total : payment === 'KHATA' && bill.paidNowBy === 'UPI' ? (paidNow as number) : 0
      const upi = qrAmount ? this.upi(qrAmount, bill.billNo as number, me.shopName) : null
      const result = { bill: this.billView(bill), stock, khata: khata ? this.view(khata) : null, upi, upiIdMissing: qrAmount > 0 && !upi, repeated: false }
      this.refs.set(ref, result)
      return ok(201, result)
    }
    if (p === '/kirana/bills' && method === 'GET') {
      const from = Number(url.searchParams.get('cursor') ?? 0) || 0
      return ok(200, { items: this.bills.slice(from, from + 50).map((b) => this.summary(b)), next: from + 50 < this.bills.length ? String(from + 50) : null })
    }
    const billM = p.match(/^\/kirana\/bills\/([^/]+)(\/.*)?$/)
    if (billM) {
      const b = this.bills.find((y) => y.id === billM[1])
      if (!b) return fail(404, 'BILL_NOT_FOUND', 'No such bill.')
      const rest = billM[2] ?? ''
      if (!rest && method === 'GET') return ok(200, this.billView(b))
      // A return whose clientRef was used comes back as it was, before anything is checked (BillService.returnItems)
      if (rest === '/returns' && this.refs.has(`ret:${body?.clientRef}`)) return ok(200, { ...this.refs.get(`ret:${body?.clientRef}`)!, repeated: true })
      const mayChange = owner || (b.byId === me.userId && Date.now() - Date.parse(b.createdAt as string) <= 10 * 60_000)
      if (!mayChange) return fail(403, 'OWNER_ONLY', 'Only the owner can change this bill now. A helper can, on his own bill, within 10 minutes of making it.', { helperMinutes: 10 })
      if (b.voidedAt) return fail(409, 'BILL_VOIDED', 'This bill was cancelled.')
      const khataOf = () => this.customers.find((y) => y.id === (b.khataCustomer as Json | null)?.id) ?? null
      if (rest === '/void') {
        if ((b.returns as Json[]).length) return fail(409, 'BILL_HAS_RETURNS', 'Items came back on this bill: return the rest instead.')
        b.voidedAt = new Date().toISOString()
        b.voidReason = body?.reason
        for (const l of (b.lines as Json[]).filter((y) => y.productId)) this.move(this.products.find((y) => y.id === l.productId)!, l.quantity as number, 'VOID', me, b)
        const c = khataOf()
        if (c && (b.onKhataPaise as number) > 0) this.entry(c, 'VOID', -(b.onKhataPaise as number), me, { billId: b.id, billNo: b.billNo })
        b.version = (b.version as number) + 1
        return ok(200, { bill: this.billView(b), stock: [], khata: c ? this.view(c) : null })
      }
      if (rest === '/returns') {
        const ref = `ret:${body?.clientRef}`
        // BillService.returnItems: each line's value before the discount, the bill's discount taken once over the
        // whole return; the last return of a bill gives back exactly what is left of its total
        let lineValue = 0
        const valueLines: Json[] = []
        for (const [i, r] of ((body?.lines as Json[]) ?? []).entries()) {
          const l = (b.lines as Json[]).find((y) => y.lineNo === r.lineNo)
          if (!l) return bad(`lines[${i}].lineNo`, 'No such line')
          const left = (l.quantity as number) - (l.returnedQuantity as number)
          if ((r.quantity as number) > left) return bad(`lines[${i}].quantity`, 'More than is left')
          const backBefore = (l.valueBack as number | undefined) ?? 0
          const v = (r.quantity as number) === left ? (l.amountPaise as number) - backBefore
            : Math.min((l.amountPaise as number) - backBefore, Math.round(((l.amountPaise as number) * (r.quantity as number)) / (l.quantity as number)))
          l.valueBack = backBefore + v
          lineValue += v
          valueLines.push({ lineNo: r.lineNo, quantity: r.quantity, valuePaise: v })
          l.returnedQuantity = (l.returnedQuantity as number) + (r.quantity as number)
          if (l.productId) this.move(this.products.find((y) => y.id === l.productId)!, r.quantity as number, 'RETURN', me, b)
        }
        const refundLeft = (b.totalPaise as number) - (b.refundedPaise as number)
        const allBack = (b.lines as Json[]).every((l) => l.returnedQuantity === l.quantity)
        const value = allBack ? refundLeft : (b.subtotalPaise as number) === 0 ? 0
          : Math.min(refundLeft, Math.round((lineValue * (b.totalPaise as number)) / (b.subtotalPaise as number)))
        const c = khataOf()
        const khataLeft = Math.max(0, (b.onKhataPaise as number) - (b.returns as Json[]).reduce((t, x) => t + (x.offKhataPaise as number), 0))
        const off = c ? (b.paidNowBy ? Math.min(value, khataLeft) : value) : 0
        if (c && off) this.entry(c, 'RETURN', -off, me, { billId: b.id, billNo: b.billNo })
        const ret: Json = { id: `kr${++this.n}`, refundPaise: value, offKhataPaise: off, handBackPaise: value - off, handBackBy: value - off ? (b.payment === 'KHATA' ? b.paidNowBy : b.payment) : null, reason: body?.reason ?? null, byName: me.name, at: new Date().toISOString(), lines: valueLines }
        ;(b.returns as Json[]).push(ret)
        b.refundedPaise = (b.refundedPaise as number) + value
        b.version = (b.version as number) + 1
        const result = { bill: this.billView(b), returned: ret, stock: [], khata: c ? this.view(c) : null, repeated: false }
        this.refs.set(ref, result)
        return ok(201, result)
      }
      if (rest === '/payment') {
        if ((b.returns as Json[]).length) return fail(409, 'BILL_HAS_RETURNS', "Items of this bill were returned already, so its payment can't be changed.")
        const paidNowBy = body?.paidNowBy ?? null
        if (body?.payment === b.payment && (body?.khataCustomerId ?? null) === ((b.khataCustomer as Json | null)?.id ?? null)
          && (body?.paidNowPaise ?? null) === b.paidNowPaise && paidNowBy === b.paidNowBy) {
          // The same payment as now changes nothing (also with an old version)
          const upi = b.payment === 'UPI' ? this.upi(b.totalPaise as number, b.billNo as number, me.shopName) : null
          return ok(200, { bill: this.billView(b), khata: [], upi, upiIdMissing: b.payment === 'UPI' && !upi })
        }
        if (body?.version !== b.version) return fail(409, 'BILL_CHANGED', 'Someone changed this bill just now. Reload it and try again.')
        const from = khataOf()
        const to = body?.payment === 'KHATA' ? this.customers.find((y) => y.id === body?.khataCustomerId) : null
        if (body?.payment === 'KHATA' && (!to || (!to.active && to !== from))) return fail(404, 'KHATA_CUSTOMER_NOT_FOUND', 'No such khata customer.')
        if (body?.paidNowPaise !== undefined && (body.paidNowPaise as number) >= (b.totalPaise as number)) return bad('paidNowPaise', 'Paid now must be less than the total')
        const onKhata = body?.payment === 'KHATA' ? (b.totalPaise as number) - ((body?.paidNowPaise as number) ?? 0) : 0
        // The limit only when it puts more on a khata than before, from the balance with the bill's old part off
        if (to && !(to === from && onKhata <= (b.onKhataPaise as number))) {
          const limit = to.creditLimitPaise as number | null
          const balance = (to.balancePaise as number) - (to === from ? (b.onKhataPaise as number) : 0)
          const avail = limit === null ? null : Math.max(0, limit - balance)
          if (avail !== null && onKhata > avail) return fail(409, 'KHATA_LIMIT', `${to.name} can buy ${r2(avail)} more on khata.`, { availablePaise: avail })
        }
        if (from && (b.onKhataPaise as number) > 0) {
          const finalFrom = (from.balancePaise as number) - (b.onKhataPaise as number) + (to === from ? onKhata : 0)
          if (finalFrom < 0 && finalFrom < (from.balancePaise as number) && !body?.advance) {
            return fail(409, 'KHATA_ALREADY_PAID', `${from.name}'s khata payments already cover this bill. Changing it leaves them ${r2(-finalFrom)} advance.`, { advanceAfterPaise: -finalFrom })
          }
        }
        const touched: Json[] = []
        if (from && (b.onKhataPaise as number) > 0) {
          this.entry(from, 'CHANGE', -(b.onKhataPaise as number), me, { billId: b.id, billNo: b.billNo })
          touched.push(from)
        }
        if (to && onKhata > 0) {
          this.entry(to, 'CHANGE', onKhata, me, { billId: b.id, billNo: b.billNo })
          if (!touched.includes(to)) touched.push(to)
        }
        ;(b.changes as Json[]).push({ fromPayment: b.payment, fromKhataCustomer: b.khataCustomer, fromPaidNowPaise: b.paidNowPaise, fromPaidNowBy: b.paidNowBy, toPayment: body?.payment, toKhataCustomer: to ? { id: to.id, name: to.name } : null, toPaidNowPaise: body?.paidNowPaise ?? null, toPaidNowBy: body?.paidNowBy ?? null, byName: me.name, at: new Date().toISOString() })
        b.payment = body?.payment
        b.khataCustomer = to ? { id: to.id, name: to.name } : null
        b.paidNowPaise = body?.payment === 'KHATA' ? ((body?.paidNowPaise as number) ?? null) : null
        b.paidNowBy = body?.payment === 'KHATA' && body?.paidNowPaise ? body?.paidNowBy : null
        b.onKhataPaise = onKhata
        b.version = (b.version as number) + 1
        const upi = body?.payment === 'UPI' ? this.upi(b.totalPaise as number, b.billNo as number, me.shopName) : null
        return ok(200, { bill: this.billView(b), khata: touched.map((c) => this.view(c)), upi, upiIdMissing: body?.payment === 'UPI' && !upi })
      }
    }
    if (p === '/kirana/day') {
      // BillService.day: everything counted on the day the money moved
      const date = url.searchParams.get('date') ?? dayOf(new Date().toISOString())
      const on = (iso: unknown) => typeof iso === 'string' && dayOf(iso) === date
      const cashOf = (pay: unknown, total: number, paidNow: unknown, by: unknown) => (pay === 'CASH' ? total : pay === 'KHATA' && by === 'CASH' ? ((paidNow as number) ?? 0) : 0)
      const upiOf = (pay: unknown, total: number, paidNow: unknown, by: unknown) => (pay === 'UPI' ? total : pay === 'KHATA' && by === 'UPI' ? ((paidNow as number) ?? 0) : 0)
      const made = this.bills.filter((b) => on(b.createdAt))
      // A bill made today shows as it was first paid; a later change counts on its own day
      const first = (b: Json) => ((b.changes as Json[])[0] ?? null)
      const firstPay = (b: Json) => {
        const f = first(b)
        return f ? { pay: f.fromPayment, paidNow: f.fromPaidNowPaise, by: f.fromPaidNowBy } : { pay: b.payment, paidNow: b.paidNowPaise, by: b.paidNowBy }
      }
      const total = (b: Json) => b.totalPaise as number
      let cash = 0, upi = 0, khata = 0
      for (const b of made) {
        const f = firstPay(b)
        cash += cashOf(f.pay, total(b), f.paidNow, f.by)
        upi += upiOf(f.pay, total(b), f.paidNow, f.by)
        khata += f.pay === 'KHATA' ? total(b) - ((f.paidNow as number) ?? 0) : 0
      }
      let changes = 0, chCash = 0, chUpi = 0, chKhata = 0
      for (const b of this.bills) {
        for (const c of (b.changes as Json[]).filter((x) => on(x.at))) {
          changes++
          chCash += cashOf(c.toPayment, total(b), c.toPaidNowPaise, c.toPaidNowBy) - cashOf(c.fromPayment, total(b), c.fromPaidNowPaise, c.fromPaidNowBy)
          chUpi += upiOf(c.toPayment, total(b), c.toPaidNowPaise, c.toPaidNowBy) - upiOf(c.fromPayment, total(b), c.fromPaidNowPaise, c.fromPaidNowBy)
          const kh = (pay: unknown, paidNow: unknown) => (pay === 'KHATA' ? total(b) - ((paidNow as number) ?? 0) : 0)
          chKhata += kh(c.toPayment, c.toPaidNowPaise) - kh(c.fromPayment, c.fromPaidNowPaise)
        }
      }
      // Khata money: payments in, minus payments undone and advances given back that day, by how
      const money = this.entries.filter((e) => ['PAYMENT', 'REVERSAL', 'REFUND'].includes(e.kind as string) && on(e.at))
      const recCash = money.filter((e) => e.method === 'CASH').reduce((t, e) => t - (e.amountPaise as number), 0)
      const recUpi = money.filter((e) => e.method === 'UPI').reduce((t, e) => t - (e.amountPaise as number), 0)
      const returns = this.bills.flatMap((b) => (b.returns as Json[]).filter((r) => on(r.at)))
      const retCash = returns.filter((r) => r.handBackBy === 'CASH').reduce((t, r) => t + (r.handBackPaise as number), 0)
      const retUpi = returns.filter((r) => r.handBackBy === 'UPI').reduce((t, r) => t + (r.handBackPaise as number), 0)
      const voided = this.bills.filter((b) => on(b.voidedAt))
      const vCash = voided.reduce((t, b) => t + cashOf(b.payment, total(b), b.paidNowPaise, b.paidNowBy), 0)
      const vUpi = voided.reduce((t, b) => t + upiOf(b.payment, total(b), b.paidNowPaise, b.paidNowBy), 0)
      return ok(200, {
        date, bills: made.length, salesPaise: made.reduce((t, b) => t + total(b), 0), discountPaise: made.reduce((t, b) => t + (b.discountPaise as number), 0),
        cashPaise: cash, upiPaise: upi, khataPaise: khata, paymentChanges: changes, changedCashPaise: chCash,
        changedUpiPaise: chUpi, changedKhataPaise: chKhata, khataReceivedPaise: recCash + recUpi, khataReceivedCashPaise: recCash,
        khataReceivedUpiPaise: recUpi, returns: returns.length, returnedPaise: returns.reduce((t, r) => t + (r.refundPaise as number), 0),
        returnedCashPaise: retCash, returnedUpiPaise: retUpi, returnedKhataPaise: returns.reduce((t, r) => t + (r.offKhataPaise as number), 0),
        cancelledBills: voided.length, cancelledPaise: voided.reduce((t, b) => t + total(b), 0), cancelledCashPaise: vCash, cancelledUpiPaise: vUpi,
        cancelledKhataPaise: voided.reduce((t, b) => t + (b.onKhataPaise as number), 0),
        cashInPaise: cash + chCash + recCash - retCash - vCash, upiInPaise: upi + chUpi + recUpi - retUpi - vUpi,
      })
    }

    // ---------- khata ----------
    if (p === '/kirana/khata' && method === 'GET') {
      const q = (url.searchParams.get('q') ?? '').toLowerCase()
      const owing = url.searchParams.get('owing') === 'true'
      const list = this.customers
        .filter((c) => !q || (c.name as string).toLowerCase().includes(q) || String(c.note ?? '').toLowerCase().includes(q) || String(c.phone ?? '').includes(q))
        .filter((c) => !owing || (c.balancePaise as number) > 0)
        .sort((a, b) => (a.name as string).localeCompare(b.name as string))
      return ok(200, {
        items: list.map((c) => this.view(c)), next: null,
        owedPaise: this.customers.reduce((t, c) => t + Math.max(0, c.balancePaise as number), 0),
        advancesPaise: this.customers.reduce((t, c) => t + Math.max(0, -(c.balancePaise as number)), 0),
      })
    }
    if (p === '/kirana/khata' && method === 'POST') {
      if ((body?.creditLimitPaise !== undefined || body?.noLimit !== undefined) && !owner) return ownerOnly()
      if (String(body?.name ?? '').trim().length < 2) return bad('name', 'Use 2 to 80 letters')
      const phone = body?.phone ? String(body.phone).replace(/\D/g, '').slice(-10) : null
      const other = phone && this.customers.find((c) => c.phone === phone && c.active)
      if (other) return fail(409, 'PHONE_TAKEN', `${other.name} in your khata already has this number.`, { customerId: other.id })
      return ok(201, this.view(this.customer({ name: String(body?.name).trim(), phone, note: body?.note ?? null, creditLimitPaise: body?.noLimit ? null : ((body?.creditLimitPaise as number) ?? 200000) })))
    }
    const kh = p.match(/^\/kirana\/khata\/([^/]+)(\/.*)?$/)
    if (kh) {
      const c = this.customers.find((y) => y.id === kh[1])
      if (!c) return fail(404, 'KHATA_CUSTOMER_NOT_FOUND', 'No such khata customer.')
      const rest = kh[2] ?? ''
      const strip = (e: Json) => {
        const { customerId: _c, ...v } = e
        return v
      }
      if (!rest && method === 'GET') return ok(200, { customer: this.view(c), entries: this.entries.filter((e) => e.customerId === c.id).map(strip), nextEntries: null })
      if (!rest && method === 'PATCH') {
        if ((body?.creditLimitPaise !== undefined || body?.noLimit !== undefined) && !owner) return ownerOnly()
        if (body?.version !== c.version) return fail(409, 'KHATA_CHANGED', 'Someone changed this customer just now. Reload and try again.')
        if (body?.active === false && (c.balancePaise as number) !== 0) return fail(409, 'STILL_OWES', `${c.name} still owes, or has an advance: settle it first.`)
        if (body?.name !== undefined) c.name = body.name
        if (body?.phone !== undefined) c.phone = body.phone ? String(body.phone).replace(/\D/g, '').slice(-10) : null
        if (body?.note !== undefined) c.note = body.note || null
        if (body?.noLimit) c.creditLimitPaise = null
        else if (body?.creditLimitPaise !== undefined) c.creditLimitPaise = body.creditLimitPaise
        if (body?.active !== undefined) c.active = body.active
        c.version = (c.version as number) + 1
        return ok(200, this.view(c))
      }
      if (rest === '/payments' && method === 'POST') {
        const ref = `pay:${body?.clientRef}`
        const first = this.refs.get(ref)
        if (first) return ok(200, { ...first, repeated: true })
        const amount = body?.amountPaise as number
        const owes = Math.max(0, c.balancePaise as number)
        if (amount > owes && !body?.advance) {
          return fail(409, 'MORE_THAN_OWED', `${c.name} owes ${r2(owes)}. Keep ${r2(amount - owes)} as their advance?`, { balancePaise: c.balancePaise, advancePaise: amount - owes, advanceAfterPaise: amount - (c.balancePaise as number) })
        }
        const e = this.entry(c, 'PAYMENT', -amount, me, { method: body?.method, note: body?.note ?? null, byId: me.userId })
        const result = { customer: this.view(c), entry: strip(e), repeated: false }
        this.refs.set(ref, result)
        return ok(201, result)
      }
      const rev = rest.match(/^\/payments\/([^/]+)\/reverse$/)
      if (rev) {
        const e = this.entries.find((y) => y.id === rev[1] && y.customerId === c.id && y.kind === 'PAYMENT')
        if (!e) return fail(404, 'KHATA_ENTRY_NOT_FOUND', 'No such payment.')
        if (!owner && (e.byId !== me.userId || Date.now() - Date.parse(e.at as string) > 10 * 60_000)) return ownerOnly()
        if (e.reversed) return fail(409, 'PAYMENT_REVERSED', 'This payment was already undone.')
        e.reversed = true
        const back = this.entry(c, 'REVERSAL', -(e.amountPaise as number), me, { reversesId: e.id, note: body?.reason, method: e.method })
        return ok(201, { customer: this.view(c), entry: strip(back), repeated: false })
      }
      if (rest === '/advance-back' && method === 'POST') {
        if (!owner) return ownerOnly()
        const ref = `adv:${body?.clientRef}`
        const first = this.refs.get(ref)
        if (first) return ok(200, { ...first, repeated: true })
        const advance = Math.max(0, -(c.balancePaise as number))
        if ((body?.amountPaise as number) > advance) return fail(409, 'MORE_THAN_ADVANCE', `Their advance is ${r2(advance)}.`, { advancePaise: advance })
        const e = this.entry(c, 'REFUND', body?.amountPaise as number, me, { method: body?.method })
        const result = { customer: this.view(c), entry: strip(e), repeated: false }
        this.refs.set(ref, result)
        return ok(201, result)
      }
    }
    return fail(404, 'NOT_FOUND', `mock: no kirana route for ${method} ${p}`)
  }
}
