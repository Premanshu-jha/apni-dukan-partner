import { lazy, Suspense, type ComponentType } from 'react'
import { Route } from 'react-router'
import { Loading } from '../components/ui'
import { withKiranaTexts } from '../i18n/kirana'
import { kiranaOn } from '../lib/config'
import { EditGate } from '../features/shop/EditGate'
import { KindOnly, RoleOnly } from './guards'

/**
 * The kirana's routes, in one place: registered only with the kirana switch on (VITE_KIRANA_ENABLED). Off, none of
 * them exists (an old /kirana/... link is "Page not found"), and every kirana screen is its own download (React.lazy),
 * so salon partners never fetch one. Each function gives the routes for one spot of App's route table, or null.
 */

/** A kirana screen as its own download (with the kiranas' words), with a spinner while it comes. */
function screen<P extends object>(load: () => Promise<ComponentType<P>>) {
  const Lazy = lazy(() => withKiranaTexts(load()).then((c) => ({ default: c })))
  return function KiranaScreen(props: P) {
    return (
      <Suspense fallback={<Loading />}>
        <Lazy {...props} />
      </Suspense>
    )
  }
}

const RegisterKind = screen(() => import('../features/shop/KiranaRegister').then((m) => m.RegisterKind))
const RegisterUpi = screen(() => import('../features/shop/KiranaRegister').then((m) => m.RegisterUpi))
const RegisterLicences = screen(() => import('../features/shop/KiranaLicences').then((m) => m.RegisterLicences))
const KiranaLicencesPage = screen(() => import('../features/shop/KiranaLicences').then((m) => m.KiranaLicencesPage))
const Counter = screen(() => import('../features/kirana/Counter').then((m) => m.Counter))
const Bills = screen(() => import('../features/kirana/Bills').then((m) => m.Bills))
const BillPage = screen(() => import('../features/kirana/Bills').then((m) => m.BillPage))
const Day = screen(() => import('../features/kirana/Bills').then((m) => m.Day))
const Products = screen(() => import('../features/kirana/Products').then((m) => m.Products))
const NewProduct = screen(() => import('../features/kirana/Products').then((m) => m.NewProduct))
const ProductPage = screen(() => import('../features/kirana/Products').then((m) => m.ProductPage))
const Khata = screen(() => import('../features/kirana/Khata').then((m) => m.Khata))
const Customer = screen(() => import('../features/kirana/Khata').then((m) => m.Customer))
const KiranaTeam = screen(() => import('../features/kirana/KiranaTeam').then((m) => m.KiranaTeam))
const KiranaUpi = screen(() => import('../features/kirana/KiranaTeam').then((m) => m.KiranaUpi))

/** "What do you run?": first, and again from "Change" on any step until Submit (off: a salon, never asked). */
export function kiranaKindRoute() {
  if (!kiranaOn()) return null
  return <Route path="/register/kind" element={<RegisterKind />} />
}

/** A kirana's own registration steps (licences, UPI ID), inside the registration layout. */
export function kiranaRegisterRoutes() {
  if (!kiranaOn()) return null
  return (
    <Route element={<KindOnly kind="KIRANA" />}>
      <Route path="/register/licences" element={<RegisterLicences />} />
      <Route path="/register/upi" element={<RegisterUpi />} />
    </Route>
  )
}

/** A kirana's owner and helpers: the counter and its book (the bottom bar's tabs). */
export function kiranaTabRoutes() {
  if (!kiranaOn()) return null
  return (
    <Route element={<KindOnly kind="KIRANA" />}>
      <Route path="/kirana/counter" element={<Counter />} />
      <Route path="/kirana/bills" element={<Bills />} />
      <Route path="/kirana/products" element={<Products />} />
      <Route path="/kirana/khata" element={<Khata />} />
    </Route>
  )
}

/** A kirana's full-screen pages: a bill, the day, a product, a khata customer, and the owner's team, UPI ID, licences. */
export function kiranaScreenRoutes() {
  if (!kiranaOn()) return null
  return (
    <Route element={<KindOnly kind="KIRANA" />}>
      <Route path="/kirana/bills/:id" element={<BillPage />} />
      <Route path="/kirana/day" element={<Day />} />
      <Route path="/kirana/products/new" element={<NewProduct />} />
      <Route path="/kirana/products/:id" element={<ProductPage />} />
      <Route path="/kirana/khata/:id" element={<Customer />} />
      <Route element={<RoleOnly roles={['OWNER']} />}>
        <Route path="/kirana/team" element={<KiranaTeam />} />
        <Route path="/kirana/upi" element={<EditGate><KiranaUpi /></EditGate>} />
        <Route path="/kirana/licences" element={<EditGate><KiranaLicencesPage /></EditGate>} />
      </Route>
    </Route>
  )
}
