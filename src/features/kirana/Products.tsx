import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { fieldError, isApiError, messageOf } from '../../api/errors'
import {
  kiranaApi,
  kiranaKeys,
  useProduct,
  useProducts,
  useRunningOut,
  type Product,
  type StockReason,
  type Unit,
} from '../../api/kirana'
import { useShop } from '../../api/shop'
import { cameFrom } from '../shop/Register'
import { Banner, Button, Card, Chip, EmptyState, ErrorState, Field, Loading, Page, Pill, Sheet } from '../../components/ui'
import { useT } from '../../i18n'
import { dateTimeIst } from '../../lib/ist'
import { addProduct, parseQty, parseRupees, priceUnit, qtyText, qtyWithUnit, rupeesInput, toMilli } from '../../lib/kirana'
import { rupees } from '../../lib/money'
import { useSession } from '../../store/session'
import { cartOwner, useCart } from './cart'
import { MoreButton, moveText, outcomeUnknown, SearchBox, useDebounced, UnsureNote, useRefreshOnStale, useUnsureSend } from './common'
import { readProductDraft, writeProductDraft } from './drafts'
import { Scanner } from './Scanner'

/** Products: the shop's catalogue, searched by name or barcode digits; and what is running out. */
export function Products() {
  const t = useT()
  const [tab, setTab] = useState<'all' | 'low'>('all')
  const [search, setSearch] = useState('')
  const settled = useDebounced(search)
  return (
    <Page title={t('kiranaProducts.productsTitle')}>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('kiranaProducts.showLabel')}>
        <Chip selected={tab === 'all'} onClick={() => setTab('all')}>
          {t('kiranaProducts.tabAll')}
        </Chip>
        <Chip selected={tab === 'low'} onClick={() => setTab('low')}>
          {t('kiranaProducts.tabRunningOut')}
        </Chip>
      </div>
      <Link to="/kirana/products/new" className="flex min-h-12 items-center justify-center rounded-xl border border-line bg-raised font-semibold hover:bg-line">
        {t('kiranaProducts.addProductLink')}
      </Link>
      {tab === 'all' ? (
        <>
          <SearchBox id="product-search" label={t('kiranaProducts.searchLabel')} placeholder={t('kiranaProducts.searchPlaceholder')} value={search} onChange={setSearch} />
          <AllProducts search={settled} />
        </>
      ) : (
        <RunningOut />
      )}
    </Page>
  )
}

function AllProducts({ search }: { search: string }) {
  const t = useT()
  const list = useProducts(search)
  if (list.isPending) return <Loading />
  if (list.isError && !list.data) return <ErrorState message={messageOf(list.error)} onRetry={() => list.refetch()} />
  const items = list.data.pages.flatMap((p) => p.items)
  if (!items.length) {
    return search.trim() ? (
      <p className="text-sm text-muted">{t('kiranaProducts.nothingCalled', { query: search.trim() })}</p>
    ) : (
      <EmptyState title={t('kiranaProducts.noProductsTitle')} body={t('kiranaProducts.noProductsBody')} />
    )
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((p) => (
        <ProductRow key={p.id} p={p} />
      ))}
      <li>
        <MoreButton shown={list.hasNextPage} busy={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />
      </li>
    </ul>
  )
}

function RunningOut() {
  const t = useT()
  const list = useRunningOut()
  if (list.isPending) return <Loading />
  if (list.isError && !list.data) return <ErrorState message={messageOf(list.error)} onRetry={() => list.refetch()} />
  if (!list.data.length) return <EmptyState title={t('kiranaProducts.nothingRunningOutTitle')} body={t('kiranaProducts.nothingRunningOutBody')} />
  return (
    <ul className="flex flex-col gap-2">
      {list.data.map((p) => (
        <ProductRow key={p.id} p={p} />
      ))}
    </ul>
  )
}

function ProductRow({ p }: { p: Product }) {
  const t = useT()
  const milli = toMilli(p.stock)
  return (
    <li>
      <Link to={`/kirana/products/${p.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3 hover:bg-raised">
        <span className="min-w-0">
          <span className="block font-medium break-words">{p.name}</span>
          <span className="block text-xs text-muted">
            {rupees(p.pricePaise)}
            {priceUnit(p.unit)}
            {p.barcodes.length === 0 && ` · ${t('kiranaProducts.noBarcode')}`}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 text-sm">
          <span className={milli < 0 ? 'text-bad' : ''}>{qtyWithUnit(milli, p.unit)}</span>
          {!p.active ? <Pill tone="muted">{t('kiranaProducts.removedPill')}</Pill> : p.runningOut ? <Pill tone="warn">{t('kiranaProducts.runningOutPill')}</Pill> : null}
        </span>
      </Link>
    </li>
  )
}

/**
 * A new product: name, piece or kg, price, its barcode (scanned or typed; from the counter it comes filled in), and the
 * stock on the shelf now. Back goes where it came from (the counter, or Products).
 */
export function NewProduct() {
  const t = useT()
  const stale = useRefreshOnStale()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const params = new URLSearchParams(useLocation().search)
  const from = params.get('from')?.startsWith('/kirana/') ? params.get('from')! : '/kirana/products'
  // What was typed survives leaving the screen (a customer to serve, a tap on Back): kept in this tab until saved
  const [draft] = useState(() => {
    const d = readProductDraft()
    // Opened for another barcode or name than the one typed before: start fresh with it
    const asked = params.get('barcode') ?? params.get('name')
    return d && (!asked || asked === d.barcode || asked === d.name) ? d : null
  })
  const [name, setName] = useState(draft?.name ?? params.get('name') ?? '')
  const [unit, setUnit] = useState<Unit>(draft?.unit ?? 'PIECE')
  const [price, setPrice] = useState(draft?.price ?? '')
  const [barcode, setBarcode] = useState(draft?.barcode ?? params.get('barcode') ?? '')
  const [pack, setPack] = useState(draft?.pack ?? '1')
  const [stock, setStock] = useState(draft?.stock ?? '')
  const [alertAt, setAlertAt] = useState(draft?.alertAt ?? '')
  const [linking, setLinking] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const shop = useShop()
  const userId = useSession((st) => st.user?.id ?? '')
  const dirty = Boolean(price.trim() || stock.trim() || alertAt.trim() || (name.trim() && name !== (params.get('name') ?? '')))
  useEffect(() => {
    writeProductDraft(dirty ? { name, unit, price, barcode, pack, stock, alertAt } : null)
  }, [dirty, name, unit, price, barcode, pack, stock, alertAt])
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const nameErr = name.trim().length < 2 ? t('kiranaProducts.nameErrNew') : null
  const p = parseRupees(price, { maxPaise: 10_000_000 })
  const s = stock.trim() ? parseQty(stock, unit, { zeroAllowed: true }) : null
  const a = alertAt.trim() ? parseQty(alertAt, unit, { zeroAllowed: true }) : null
  const k = barcode.trim() ? parseQty(pack, unit) : null

  async function save() {
    setTouched(true)
    setError(null)
    if (nameErr || 'error' in p || (s && 'error' in s) || (a && 'error' in a) || (k && 'error' in k)) return
    setBusy(true)
    try {
      const made = await kiranaApi.addProduct({
        name: name.trim(),
        unit,
        pricePaise: p.paise,
        barcode: barcode.trim() || undefined,
        pack: k && 'milli' in k ? k.milli / 1000 : undefined,
        stock: s && 'milli' in s ? s.milli / 1000 : undefined,
        lowStockAt: a && 'milli' in a ? a.milli / 1000 : undefined,
      })
      void qc.invalidateQueries({ queryKey: kiranaKeys.all })
      writeProductDraft(null)
      // Added from the counter (a barcode it didn't know, or a name searched): it goes onto the bill being made,
      // unless that bill is waiting to be tried again exactly as it was sent
      if (from === '/kirana/counter' && made.unit === 'PIECE') toBill(made, k && 'milli' in k ? k.milli : 1000)
      // A loose one: the counter opens its weight-or-amount sheet, as picking it there does
      navigate(from === '/kirana/products' ? `/kirana/products/${made.id}` : from, {
        replace: true,
        state: from === '/kirana/counter' && made.unit === 'KG' ? { loose: made } : undefined,
      })
    } catch (e) {
      stale(e)
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  function toBill(made: Product, milli: number) {
    const cart = useCart.getState()
    cart.open(cartOwner(userId, shop.id))
    if (!useCart.getState().cart.unsure) cart.set((c) => addProduct(c, made, milli))
  }

  // NAME_TAKEN with a barcode typed: that barcode belongs on the product they already have
  async function linkToExisting(productId: string) {
    if (!k || !('milli' in k)) return
    setLinking(true)
    try {
      const saved = await kiranaApi.addBarcode(productId, barcode.trim(), k.milli / 1000)
      void qc.invalidateQueries({ queryKey: kiranaKeys.all })
      writeProductDraft(null)
      if (from === '/kirana/counter' && saved.unit === 'PIECE') toBill(saved, k.milli)
      navigate(from === '/kirana/products' ? `/kirana/products/${saved.id}` : from, { replace: true })
    } catch (e) {
      stale(e)
      setError(e)
    } finally {
      setLinking(false)
    }
  }

  const fe = (f: string) => fieldError(error, f)
  return (
    <Page back={from} title={t('kiranaProducts.addProductTitle')}>
      <Card className="flex flex-col gap-4">
        <Field id="product-name" label={t('kiranaProducts.nameLabel')} hint={t('kiranaProducts.nameHint')} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} error={(touched && nameErr) || fe('name')} />
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-muted">{t('kiranaProducts.soldBy')}</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('kiranaProducts.soldBy')}>
            <Chip selected={unit === 'PIECE'} onClick={() => setUnit('PIECE')}>
              {t('kiranaProducts.unitPiece')}
            </Chip>
            <Chip selected={unit === 'KG'} onClick={() => setUnit('KG')}>
              {t('kiranaProducts.unitKg')}
            </Chip>
          </div>
        </div>
        <Field id="product-price" label={unit === 'KG' ? t('kiranaProducts.priceKgLabel') : t('kiranaProducts.priceOneLabel')} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} error={(touched && 'error' in p ? p.error : undefined) || fe('pricePaise')} />
      </Card>
      <Card className="flex flex-col gap-3">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Field id="product-barcode" label={t('kiranaProducts.barcodeOptional')} inputMode="numeric" value={barcode} maxLength={32} onChange={(e) => setBarcode(e.target.value.trim())} error={fe('barcode')} />
          </div>
          <Button variant="secondary" onClick={() => setScanning(true)}>
            {t('kiranaProducts.scan')}
          </Button>
        </div>
        {barcode.trim() && (
          <Field
            id="product-pack"
            label={unit === 'KG' ? t('kiranaProducts.packKgLabel') : t('kiranaProducts.packPiecesLabel')}
            hint={t('kiranaProducts.packHintNew')}
            inputMode="decimal"
            value={pack}
            onChange={(e) => setPack(e.target.value)}
            error={(touched && k && 'error' in k ? k.error : undefined) || fe('pack')}
          />
        )}
      </Card>
      <Card className="flex flex-col gap-3">
        <Field id="product-stock" label={unit === 'KG' ? t('kiranaProducts.stockNowKg') : t('kiranaProducts.stockNowPieces')} inputMode="decimal" value={stock} onChange={(e) => setStock(e.target.value)} error={(touched && s && 'error' in s ? s.error : undefined) || fe('stock')} />
        <Field id="product-alert" label={t('kiranaProducts.alertLabelOptional')} hint={t('kiranaProducts.alertHint')} inputMode="decimal" value={alertAt} onChange={(e) => setAlertAt(e.target.value)} error={(touched && a && 'error' in a ? a.error : undefined) || fe('lowStockAt')} />
      </Card>
      {error !== null && !['name', 'pricePaise', 'barcode', 'pack', 'stock', 'lowStockAt'].some((f) => fe(f)) && (
        <Banner tone="bad">
          {messageOf(error)}
          {isApiError(error, 'NAME_TAKEN') && typeof error.details.productId === 'string' && (
            <>
              {' '}
              <Link to={`/kirana/products/${error.details.productId}`} className="underline">
                {t('kiranaProducts.openIt')}
              </Link>
            </>
          )}
        </Banner>
      )}
      {isApiError(error, 'NAME_TAKEN') && typeof error.details.productId === 'string' && barcode.trim() && (
        <Button variant="secondary" busy={linking} onClick={() => void linkToExisting(error.details.productId as string)}>
          {error.details.name != null ? t('kiranaProducts.addBarcodeTo', { code: barcode.trim(), name: String(error.details.name) }) : t('kiranaProducts.addBarcodeToIt', { code: barcode.trim() })}
        </Button>
      )}
      <Button busy={busy} onClick={save}>
        {t('kiranaProducts.saveProduct')}
      </Button>
      <Sheet open={scanning} title={t('kiranaProducts.scanBarcodeTitle')} onClose={() => setScanning(false)}>
        <Scanner
          onCode={(c) => {
            setBarcode(c)
            setScanning(false)
          }}
        />
      </Sheet>
    </Page>
  )
}

/**
 * One product: its price, stock and barcodes, the owner's changes (name, price, unit before its first sale, alert,
 * removing it), stock that came in, was damaged or was counted, and its latest stock changes with who and why.
 */
export function ProductPage() {
  const t = useT()
  const { id = '' } = useParams()
  const location = useLocation()
  const detail = useProduct(id)
  const back = cameFrom(location, '/kirana/products')
  if (detail.isPending) return <Page back={back} title={t('kiranaProducts.productTitle')}><Loading /></Page>
  if (detail.isError && !detail.data) {
    return (
      <Page back={back} title={t('kiranaProducts.productTitle')}>
        <ErrorState message={messageOf(detail.error)} onRetry={() => detail.refetch()} />
      </Page>
    )
  }
  // Keyed by the product, not its version: a refusal for a change made elsewhere (PRODUCT_CHANGED) reloads it
  // without closing the edit sheet or losing what was typed and the message saying why
  return <ProductView key={detail.data.product.id} back={back} />
}

function ProductView({ back }: { back: string }) {
  const t = useT()
  const stale = useRefreshOnStale()
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const shop = useShop()
  const owner = shop.myRole === 'OWNER'
  const detail = useProduct(id)
  const p = detail.data!.product
  const moves = detail.data!.moves
  const [editing, setEditing] = useState(false)
  const [stockSheet, setStockSheet] = useState<StockReason | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const milli = toMilli(p.stock)

  async function refresh(next?: Product) {
    if (next) qc.setQueryData(kiranaKeys.product(id), { product: next, moves })
    await qc.invalidateQueries({ queryKey: kiranaKeys.all })
  }

  async function removeBarcode(code: string) {
    setBusy(true)
    setError(null)
    try {
      await refresh(await kiranaApi.removeBarcode(p.id, code))
    } catch (e) {
      stale(e)
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }

  async function setActive(active: boolean) {
    setBusy(true)
    setError(null)
    try {
      await refresh(await kiranaApi.editProduct(p.id, { version: p.version, active }))
    } catch (e) {
      stale(e)
      setError(messageOf(e))
      if (isApiError(e, 'PRODUCT_CHANGED')) void detail.refetch()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page back={back} title={t('kiranaProducts.productTitle')}>
      <Card className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 text-lg font-semibold break-words">{p.name}</h2>
          {owner && p.active && (
            <button type="button" className="shrink-0 text-sm text-link" onClick={() => setEditing(true)}>
              {t('common.edit')}
            </button>
          )}
        </div>
        <p>
          {rupees(p.pricePaise)}
          {priceUnit(p.unit)}
        </p>
        {!owner && <p className="text-xs text-muted">{t('kiranaProducts.ownerOnly')}</p>}
        <p className={milli < 0 ? 'text-bad' : ''}>
          {t('kiranaProducts.inStock')} <span className="font-semibold">{qtyWithUnit(milli, p.unit)}</span>
          {milli < 0 && ` ${t('kiranaProducts.soldMoreThanKnown')}`}
        </p>
        <p className="text-sm text-muted">
          {p.lowStockAt === null ? t('kiranaProducts.noAlert') : t('kiranaProducts.alertAt', { qty: qtyWithUnit(toMilli(p.lowStockAt), p.unit) })}
          {p.runningOut && ` · ${t('kiranaProducts.runningOutSuffix')}`}
        </p>
        {!p.active && <Banner tone="info">{t('kiranaProducts.removedBanner')}</Banner>}
      </Card>

      {p.active && (
        <Card className="flex flex-col gap-2">
          <p className="font-semibold">{t('kiranaProducts.stockHeading')}</p>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="secondary" onClick={() => setStockSheet('RESTOCK')}>
              {t('kiranaProducts.cameIn')}
            </Button>
            <Button variant="secondary" onClick={() => setStockSheet('DAMAGED')}>
              {t('kiranaProducts.damaged')}
            </Button>
            <Button variant="secondary" onClick={() => setStockSheet('COUNT')}>
              {t('kiranaProducts.count')}
            </Button>
          </div>
        </Card>
      )}

      <Card className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="font-semibold">{t('kiranaProducts.barcodesHeading')}</p>
          {p.active && p.barcodes.length < 10 && (
            <button type="button" className="text-sm text-link" onClick={() => setAdding(true)}>
              {t('kiranaProducts.addBarcodeLink')}
            </button>
          )}
        </div>
        {p.barcodes.length === 0 ? (
          <p className="text-sm text-muted">{t('kiranaProducts.noBarcodesYet')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {p.barcodes.map((b) => (
              <li key={b.code} className="flex items-center justify-between gap-2 text-sm">
                <span className="break-all">
                  {b.code}
                  {b.pack !== 1 && <span className="text-muted"> · {t('kiranaProducts.perScan', { qty: qtyWithUnit(toMilli(b.pack), p.unit) })}</span>}
                </span>
                {owner && (
                  <button type="button" disabled={busy} className="min-h-11 shrink-0 px-2 text-bad" aria-label={t('kiranaProducts.removeBarcode', { code: b.code })} onClick={() => void removeBarcode(b.code)}>
                    {t('common.remove')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {error && <Banner tone="bad">{error}</Banner>}

      <section aria-labelledby="moves" className="flex flex-col gap-2">
        <h2 id="moves" className="font-semibold">
          {t('kiranaProducts.latestMoves')}
        </h2>
        {moves.length === 0 ? (
          <p className="text-sm text-muted">{t('kiranaProducts.noneYet')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {moves.map((m, i) => (
              <li key={`${m.at}-${i}`} className="flex items-start justify-between gap-3 border-b border-line py-2 text-sm">
                <span className="min-w-0">
                  <span className="block">
                    {moveText(m.reason)}
                    {m.billNo !== null && m.billId && (
                      <>
                        {' · '}
                        <Link to={`/kirana/bills/${m.billId}`} className="text-link underline">
                          {t('kiranaProducts.billLink', { billNo: String(m.billNo) })}
                        </Link>
                      </>
                    )}
                  </span>
                  <span className="block text-xs text-muted break-words">
                    {dateTimeIst(m.at)}
                    {m.byName && ` · ${m.byName}`}
                    {m.note && ` · ${m.note}`}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block">{m.change > 0 ? '+' : ''}{qtyText(toMilli(m.change))}</span>
                  <span className="block text-xs text-muted">→ {qtyText(toMilli(m.stockAfter))}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {owner && (
        <Button variant={p.active ? 'ghost' : 'secondary'} className={p.active ? 'text-bad' : ''} busy={busy} onClick={() => void setActive(!p.active)}>
          {p.active ? t('kiranaProducts.removeProduct') : t('kiranaProducts.restoreProduct')}
        </Button>
      )}

      <Sheet open={editing} title={t('kiranaProducts.editProductTitle')} onClose={() => setEditing(false)}>
        {editing && (
          <EditProduct
            p={p}
            onSaved={(next) => {
              setEditing(false)
              void refresh(next)
            }}
          />
        )}
      </Sheet>
      <Sheet open={stockSheet !== null} title={stockSheet === 'RESTOCK' ? t('kiranaProducts.sheetRestock') : stockSheet === 'DAMAGED' ? t('kiranaProducts.sheetDamaged') : t('kiranaProducts.sheetCount')} onClose={() => setStockSheet(null)}>
        {stockSheet && (
          <StockForm
            p={p}
            reason={stockSheet}
            onSaved={() => {
              setStockSheet(null)
              void refresh()
            }}
          />
        )}
      </Sheet>
      <Sheet open={adding} title={t('kiranaProducts.addBarcodeTitle')} onClose={() => setAdding(false)}>
        {adding && (
          <AddBarcode
            p={p}
            owner={owner}
            onSaved={(next) => {
              setAdding(false)
              void refresh(next)
            }}
          />
        )}
      </Sheet>
    </Page>
  )
}

/** The owner's changes: name, price, unit (only before its first sale), the running-out alert. */
function EditProduct({ p, onSaved }: { p: Product; onSaved: (next: Product) => void }) {
  const t = useT()
  const stale = useRefreshOnStale()
  const [name, setName] = useState(p.name)
  const [price, setPrice] = useState(rupeesInput(p.pricePaise))
  const [unit, setUnit] = useState<Unit>(p.unit)
  const [alertAt, setAlertAt] = useState(p.lowStockAt === null ? '' : qtyText(toMilli(p.lowStockAt)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [touched, setTouched] = useState(false)
  const r = parseRupees(price, { maxPaise: 10_000_000 })
  const a = alertAt.trim() ? parseQty(alertAt, unit, { zeroAllowed: true }) : null
  const nameErr = name.trim().length < 2 ? t('kiranaProducts.nameErrEdit') : null

  async function save() {
    setTouched(true)
    setError(null)
    if (nameErr || 'error' in r || (a && 'error' in a)) return
    setBusy(true)
    try {
      const alertMilli = a && 'milli' in a ? a.milli : null
      const oldAlert = p.lowStockAt === null ? null : toMilli(p.lowStockAt)
      onSaved(
        await kiranaApi.editProduct(p.id, {
          version: p.version,
          name: name.trim() !== p.name ? name.trim() : undefined,
          pricePaise: r.paise !== p.pricePaise ? r.paise : undefined,
          unit: unit !== p.unit ? unit : undefined,
          lowStockAt: alertMilli !== null && alertMilli !== oldAlert ? alertMilli / 1000 : undefined,
          noLowStockAlert: alertMilli === null && oldAlert !== null ? true : undefined,
        }),
      )
    } catch (e) {
      stale(e)
      setError(e)
    } finally {
      setBusy(false)
    }
  }
  const fe = (f: string) => fieldError(error, f)
  return (
    <div className="flex flex-col gap-3">
      <Field id="edit-name" label={t('kiranaProducts.nameLabel')} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} error={(touched && nameErr) || fe('name')} />
      <Field id="edit-price" label={unit === 'KG' ? t('kiranaProducts.priceKgLabel') : t('kiranaProducts.priceOneLabel')} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} error={(touched && 'error' in r ? r.error : undefined) || fe('pricePaise')} />
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('kiranaProducts.soldBy')}>
        <Chip selected={unit === 'PIECE'} onClick={() => setUnit('PIECE')}>
          {t('kiranaProducts.unitPiece')}
        </Chip>
        <Chip selected={unit === 'KG'} onClick={() => setUnit('KG')}>
          {t('kiranaProducts.unitKg')}
        </Chip>
      </div>
      {fe('unit') && <p className="text-sm text-bad">{fe('unit')}</p>}
      <Field id="edit-alert" label={t('kiranaProducts.alertLabelEdit')} inputMode="decimal" value={alertAt} onChange={(e) => setAlertAt(e.target.value)} error={(touched && a && 'error' in a ? a.error : undefined) || fe('lowStockAt')} />
      <p className="text-sm text-muted">{t('kiranaProducts.newPriceNote')}</p>
      {error !== null && !['name', 'pricePaise', 'unit', 'lowStockAt'].some((f) => fe(f)) && <Banner tone="bad">{messageOf(error)}</Banner>}
      <Button busy={busy} onClick={save}>
        {t('common.save')}
      </Button>
    </div>
  )
}

/** Stock that came in (added), was damaged (taken off), or counted by hand (set to the count). */
function StockForm({ p, reason, onSaved }: { p: Product; reason: StockReason; onSaved: () => void }) {
  const t = useT()
  const stale = useRefreshOnStale()
  // One change, one clientRef: a retried Save after a lost answer changes the stock once, even after closing the sheet
  const send = useUnsureSend<{ reason: StockReason; quantity: number; note?: string }>(`stock:${p.id}`)
  const held = send.unsure
  const shown = held?.reason ?? reason
  const [qty, setQty] = useState(held ? qtyText(toMilli(held.quantity)) : '')
  const [note, setNote] = useState(held?.note ?? '')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const count = shown === 'COUNT'
  async function save() {
    let values = held
    if (!values) {
      const q = parseQty(qty, p.unit, { zeroAllowed: count })
      if ('error' in q) return setErr(q.error)
      values = { reason, quantity: q.milli / 1000, note: note.trim() || undefined }
    }
    setBusy(true)
    setErr(null)
    try {
      await kiranaApi.stock(p.id, { clientRef: send.clientRef, ...values })
      send.settle()
      onSaved()
    } catch (e) {
      stale(e)
      if (outcomeUnknown(e)) send.keep(values)
      setErr(messageOf(e))
    } finally {
      setBusy(false)
    }
  }
  const kg = p.unit === 'KG'
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{t('kiranaProducts.stockNow', { qty: qtyWithUnit(toMilli(p.stock), p.unit) })}</p>
      {held && <UnsureNote what={count ? 'count' : shown === 'RESTOCK' ? 'restock' : 'takenOff'} onStartOver={() => { send.settle(); setErr(null) }} />}
      <Field
        id="stock-qty"
        label={
          count
            ? kg ? t('kiranaProducts.howManyShelfKg') : t('kiranaProducts.howManyShelfPieces')
            : shown === 'RESTOCK'
              ? kg ? t('kiranaProducts.howManyCameInKg') : t('kiranaProducts.howManyCameInPieces')
              : kg ? t('kiranaProducts.howManyTakeOffKg') : t('kiranaProducts.howManyTakeOffPieces')
        }
        inputMode="decimal"
        disabled={!!held}
        value={qty}
        onChange={(e) => {
          setQty(e.target.value)
          setErr(null)
        }}
        error={err ?? undefined}
        autoFocus
      />
      <Field id="stock-note" label={t('kiranaProducts.noteOptional')} value={note} disabled={!!held} maxLength={200} onChange={(e) => setNote(e.target.value)} />
      <Button busy={busy} onClick={save}>
        {t('common.save')}
      </Button>
    </div>
  )
}

/** Another barcode for this product: scanned or typed, with how many one scan means. */
function AddBarcode({ p, owner, onSaved }: { p: Product; owner: boolean; onSaved: (next: Product) => void }) {
  const t = useT()
  const stale = useRefreshOnStale()
  const [code, setCode] = useState('')
  const [pack, setPack] = useState('1')
  const [scanning, setScanning] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  async function save() {
    const k = parseQty(pack, p.unit)
    if (!code.trim()) return setError(new Error(t('kiranaProducts.scanOrTypeBarcode')))
    if ('error' in k) return setError(new Error(k.error))
    setBusy(true)
    setError(null)
    try {
      onSaved(await kiranaApi.addBarcode(p.id, code.trim(), k.milli / 1000))
    } catch (e) {
      stale(e)
      setError(e)
    } finally {
      setBusy(false)
    }
  }
  if (scanning) {
    return (
      <div className="flex flex-col gap-3">
        <Scanner
          onCode={(c) => {
            setCode(c)
            setScanning(false)
          }}
        />
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <Field id="barcode-code" label={t('kiranaProducts.barcodeLabel')} inputMode="numeric" value={code} maxLength={32} onChange={(e) => setCode(e.target.value.trim())} error={fieldError(error, 'code')} />
      <Field
        id="barcode-pack"
        label={p.unit === 'KG' ? t('kiranaProducts.packKgLabel') : t('kiranaProducts.packPiecesLabel')}
        hint={owner ? t('kiranaProducts.packHintOwner') : t('kiranaProducts.packHintHelper')}
        inputMode="decimal"
        value={pack}
        onChange={(e) => setPack(e.target.value)}
        error={fieldError(error, 'pack')}
      />
      {error !== null && !fieldError(error, 'code') && !fieldError(error, 'pack') && <Banner tone="bad">{error instanceof Error && !isApiError(error) ? error.message : messageOf(error)}</Banner>}
      <Button busy={busy} onClick={save}>
        {t('kiranaProducts.saveBarcode')}
      </Button>
      <Button variant="ghost" onClick={() => setScanning(true)}>
        {t('kiranaProducts.scanAgain')}
      </Button>
    </div>
  )
}

