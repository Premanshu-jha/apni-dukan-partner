# Clozest — partner app

The app salons use to run their day on Clozest: register the salon, set up services and barbers, and work the
day's bookings and walk-ins. It is a phone-first web app (it can be added to the home screen) and talks only to
[apni-dukan-backend](https://github.com/Premanshu-jha/apni-dukan-backend).

One app for everyone in a salon, each seeing only their part:

| Role | How they get in | What they see |
| --- | --- | --- |
| Owner | Registers the salon here | Everything: setup, the day board, breaks and leave, closed days, pause, Team |
| Helper | The owner invites their number in Team; they accept | The day board and its actions, breaks, pause; setup to look at, not change |
| Barber | The owner invites his number on his barber page; he accepts | His own bookings and his own breaks (everyone's day if the owner gave him walk-in access) |

On `main` the app is for salons. Kiranas (grocery and general stores) are built on the `kirana-partner` branch: a
kirana's people see only kirana screens (counter, bills, products, khata) and a salon's only salon screens. Customers use [apni-dukan-customer](https://github.com/Premanshu-jha/apni-dukan-customer);
the field team (approvals, strike support) will use the admin app.

## Run it on your laptop

You need Node 22 and the backend running (on your laptop at `http://localhost:8080`, or on Railway).

```bash
npm install
cp .env.example .env.local     # then edit the values
npm run dev                    # http://localhost:5174 (5173 is the customer app)
```

| Setting | What it is | Example |
| --- | --- | --- |
| `VITE_API_URL` | The backend's address, no trailing slash | `http://localhost:8080` or `https://apni-dukan-backend-production.up.railway.app` |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile **site** key (public). Leave empty when the backend has no `TURNSTILE_SECRET_KEY` | `0x4AAAAAAA…` |
| `VITE_SUPPORT_EMAIL` | The support address shown under "Need help" (More, the form). Default `support@clozest.in` | `support@clozest.in` |
| `VITE_MAP_TILES` | Map tiles for the location pin. Default OpenStreetMap's, fine for low traffic (see its tile policy) | empty |

All are public values baked into the page at build time. No secret ever goes in this app.

The backend must allow this app's address in `CORS_ALLOWED_ORIGINS`: add `http://localhost:5174` for local work,
and the deployed address once it is online.

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | oxlint |
| `npm test` | Unit tests (Vitest) |
| `npm run e2e` | End-to-end tests (Playwright): a real browser drives the app against a fake backend |
| `npm run build` | Type-check and production build into `dist/` |
| `npm run icons` | Make the PNG icons from `public/icon.svg` (commit them) |

CI runs type-check, lint, unit tests, build, the end-to-end tests, the security-headers check (Caddy), `npm audit`
(high and critical) and a gitleaks secret scan on every pull request. Dependabot proposes npm and GitHub Actions
updates weekly.

### Tests

Every situation an owner, helper or barber can run into is listed in [`docs/scenarios.md`](docs/scenarios.md): the
journey, what the backend answers, what the screen shows, and which test proves it. New work adds or updates rows
there, and reviews walk the list against the code.

- **Unit tests** (`src/**/*.test.ts`): role rules, the token's shop, registration checks, rupees to paise, weekly
  hours, break and leave times in India time, pause ends, grouping by date, which message links may open, photo
  sizes, the second shift, plus the copied API client, session and India-time tests. `Today.test.tsx` draws a
  2,000-appointment day and counts card draws (a refresh with one change draws one card; nothing redraws on a timer).
- **End-to-end tests** (`e2e/`): Playwright on a phone-sized Chromium, against `e2e/mockApi.ts`, a fake backend whose
  answers follow the backend's records, rules and error codes (who may do what, versions, the start window,
  conflicts). `.env.e2e` points the app and the map tiles at it, so tests never reach the internet. Journeys:
  registration end to end, a sent-back draft, a blocked location, the gate for every shop state and role, starting
  with and without the code, no-show and undo, reassign, salon cancel, walk-ins (double tap, busy barber, no
  access), breaks with bookings in the way, leave, closed days, pause, setup with stale saves, Team, messages,
  leaving, sign-out, an expired session in two tabs, bookings opened from lists (`&open=`), hours that strand a
  booking, and a 2,000-booking day. A failed run in CI keeps its traces.

## Screens

| Screen | Address | Who |
| --- | --- | --- |
| About ("Clozest for salons": what salons get, ₹500 a month after a 30-day trial, Sign in or sign up) | `/about` (a first-time visitor at `/` lands here) | Public |
| Contact, Terms, Privacy, Refund policy, Delivery | `/contact`, `/terms`, `/privacy`, `/refunds`, `/delivery` | Public (Razorpay's website check) |
| Sign in, code, email, name | `/signin`, `/signin/code`, `/welcome/*` | Everyone (same as the customer app); links to the public pages at the bottom |
| Start (no shop yet) | `/start` | New people |
| What do you run? (Kirana or Salon; again from "Change" on any step until Submit) | `/register/kind` | New owners, owner of a draft |
| Register: details, photos, submit (a salon also services and hours; a kirana its UPI ID) | `/register`, `/register/photos`, `/register/services`, `/register/hours`, `/register/upi`, `/register/review` | Owner of a draft |
| Kirana: Counter, Bills, Products, Khata (the bottom bar) | `/kirana/counter`, `/kirana/bills`, `/kirana/products`, `/kirana/khata` | A kirana's owner and helpers |
| Kirana: a bill, the day's totals, a product, a new product, a khata customer | `/kirana/bills/:id`, `/kirana/day?date=`, `/kirana/products/:id`, `/kirana/products/new?barcode=&name=&from=`, `/kirana/khata/:id` | A kirana's owner and helpers (owner-only changes hidden from helpers) |
| Kirana: Team, UPI ID | `/kirana/team`, `/kirana/upi` | A kirana's owner |
| Today (the day board) | `/salon/day?date=` | Everyone |
| New walk-in | `/salon/walk-in` | Owner; others with walk-in access |
| Add a break or leave | `/salon/time-off` | Breaks: everyone (a barber for himself); leave: owner |
| Bookings: coming up, history | `/salon/bookings` | Everyone; history for owner and helper |
| Salon: services, barbers, booking rules | `/setup`, `/setup/*` | Owner edits; helper looks |
| Team | `/team` | Owner |
| Closed days | `/salon/closures` | Owner |
| Offers: the list, a new offer | `/salon/offers`, `/salon/offers/new` | Owner makes and ends them; helper looks |
| More (profile, help, sign out, leave) | `/more` | Everyone |
| Delete account | `/profile/delete` | Helpers, barbers, and anyone without a shop (an owner sees "Close or hand over your shop first", with links) |
| Close the shop | `/shop/close` | Owner (any status) |
| Hand over the shop | `/shop/handover` | Owner (any status) |
| Take over a shop (requests to my number) | `/handover`, and at the top of Start and the day board | Anyone signed in, shop or not |
| Messages | `/notifications` | Everyone |

## Flows

### Who sees what after sign-in

```mermaid
flowchart TD
  A["Signed in, email and name done"] --> B{"GET /shops/me"}
  B -- "404 NO_SHOP" --> C["Start: register (What do you run?), or ask the owner to add me"]
  B -- "type KIRANA" --> K{"Status and role"}
  K -- "DRAFT, owner" --> KR["Register: details, photos, UPI ID, submit"]
  K -- "PENDING_VISIT (owner), APPROVED, SUSPENDED" --> KC["Counter · Bills · Products · Khata · More"]
  B -- "SALON" --> D{"Status and role"}
  D -- "DRAFT, owner" --> R["Register: details, photos, submit"]
  D -- "DRAFT or PENDING_VISIT, helper or barber" --> W["Your salon isn't live yet"]
  D -- "PENDING_VISIT, owner" --> T1["Today, with the waiting card and setup checklist"]
  D -- "APPROVED" --> T["Today"]
  D -- "SUSPENDED" --> S["Today, read-only, with the reason"]
  R -- "submit" --> T1
  T1 -- "field team approves" --> T
  T1 -- "field team sends it back" --> R
```

### Registering a salon

```mermaid
sequenceDiagram
  participant O as Owner's phone
  participant A as Partner app
  participant B as Backend
  participant R2 as Cloudflare R2
  O->>A: Details, then "Use my location" (GPS; empty address fields filled from POST /shops/reverse-geocode) or "Find my salon on the map" (POST /shops/geocode), drag the pin
  A->>B: POST /shops (type SALON)
  B-->>A: 201 DRAFT
  A->>B: POST /auth/refresh (the new token carries the shop)
  O->>A: Owner photo, shop front (shrunk on the phone)
  A->>B: POST /files?purpose=OWNER_PHOTO, SHOP_PHOTO
  A->>B: PUT /shops/me/photos (version)
  O->>A: Salon video (15–45 s, up to 100 MB; length checked on the phone)
  A->>B: POST /files/video-uploads {sizeBytes, contentType, durationSeconds}
  B-->>A: 201 one-time R2 link (15 min)
  A->>R2: PUT the file straight to R2 (progress bar, Cancel, Try again on the same link)
  A->>B: POST /files/video-uploads/{id}/complete, then PUT /shops/me/video (version)
  O->>A: Submit for the visit, then "Yes, submit" (asked once more, with a summary; Not yet sends nothing)
  A->>B: POST /shops/me/submit (version)
  B-->>A: PENDING_VISIT
  Note over A: Every tab shows "Waiting for approval" on top; Today also says what happens next, with the shop code
```

### Registering a kirana, and changing the kind

"What do you run?" comes first (`/register/kind`). Before the shop is saved, the answer is kept on this phone
(`adp.registerKind`, tagged with the person, forgotten at sign-out). After that it is the shop's `type`.

A kirana's steps are Details (with an optional GSTIN), Photos (two, no video or trade licence), UPI ID
(`PUT /kirana/settings/upi-id`, checked on the phone as the backend's `UpiIds` does) and Submit. Every step shows
"Registering a … · Change". Changing the kind asks first, says what goes (a salon's video and trade licence), then calls
`PUT /shops/me/type` and goes home, which opens the first step the new kind still needs. "Change" is hidden once the
shop was ever approved (`addressLocked`); after Submit the backend refuses it (409 `WRONG_STATUS`).

### The kirana counter

```mermaid
sequenceDiagram
  participant H as Owner or helper
  participant A as Partner app
  participant B as Backend
  H->>A: Scan (BarcodeDetector, or ZXing on iPhone) / search / loose by ₹ / item not in list
  A->>B: GET /kirana/products/barcode/{code}
  B-->>A: product + pack (or 404: add, link or bill without a product)
  Note over A: The bill being made lives on this phone (adp.kiranaCart) with its clientRef
  H->>A: Cash / UPI / Khata (part paid now)
  A->>B: POST /kirana/bills {clientRef, lines, payment, discountPaise?, …}
  B-->>A: 201 bill + stock + khata + upi QR link (or the first bill again: repeated)
  A-->>H: Bill N saved, the QR drawn on the phone, what is running out
```

- Quantities are kept in thousandths (grams of a kg) in `src/lib/kirana.ts`, and money in paise. A line's amount and a
  loose amount's weight round as the backend's `Quantities` does, so the phone shows what the bill will say.
- Save is safe to tap again: the clientRef bills once. If the answer never came, the bill is locked except for trying
  again (the same clientRef). "Change this bill anyway" asks first and starts a new clientRef.
- The owner's rules are shown, not only enforced: a helper's discount up to ₹10, his own bills and khata payments
  within 10 minutes, and no product edits, limits, Team or UPI ID. The backend has the final say (403 `OWNER_ONLY`).
- No kirana screen polls. Searches wait for a 300 ms pause, and a save marks the kirana queries stale.
- The QR library (`qrcode`) and the barcode library (`@zxing/library`) are loaded only when first needed.

### A booking on the board

```mermaid
flowchart LR
  C["CONFIRMED"] -- "Start with the customer's code, from 15 min before" --> I["IN_SERVICE"]
  C -- "Start without code (owner or helper)" --> I
  I -- "its time is over (automatic)" --> D["COMPLETED"]
  C -- "No-show, from 10 min after the start (or automatic)" --> N["NO_SHOW"]
  N -- "Undo within 24 h (owner or helper)" --> C
  C -- "Cancel with a reason (owner or helper)" --> X["CANCELLED_BY_SALON"]
  C -- "Give to another barber" --> C
```

A walk-in is added straight into IN_SERVICE (it starts now). Breaks, leave and closed days are blocks on a
barber's day; the backend refuses them while a booking is in the way, so the app lists those bookings first.

## How it works

### Folders

```
src/
  api/        client (shared with the customer app), shop.ts (shop gate, registration, files), salon.ts (setup and
              the day), notifications, push, types matching the backend's records
  app/        routes, guards (signed in, past registration, role), the shell with the role's tabs
  components/ ui kit, code input, Turnstile, photo picker, pin map (Leaflet, loaded only on registration),
              location guide
  features/   auth, shop (gate, start, register, home), day (board, sheet, walk-in, time off, closed days,
              pause, bookings), setup (services, barbers, rules), team, notifications, profile (More)
  i18n/       the app's languages: index.ts (t, useT, setLanguage), LanguagePicker, and one folder of JSON files
              per language (en, hi, te, mr, ta, kn)
  lib/        India time, money, phone, roles, GPS, photo shrinking, storage, device name
e2e/          fake backend and journeys
docs/         scenarios.md
```

### The shop gate

`ShopGate` loads `GET /shops/me` once (re-read when the app comes back into view, every 30 s at most) and gives
the shop to every screen through `ShopContext`. `Home` sends each state and role to its first screen (the first
flow above); `PastRegistration` keeps board screens closed until the salon is submitted (owner) or approved
(others); `RoleOnly` keeps a role out of screens it can't use. The backend checks the same rules and has the final
say (`OWNER_ONLY`, `WALK_INS_NOT_ALLOWED`, `NOT_ALLOWED`).

### Files and the token

The backend's file uploads use the shop named in the sign-in token, and a token gets its shop when it is made. So
the app refreshes the session right after registering (as the backend asks), and `ensureShopInToken` refreshes
before any upload whose token has no shop claim yet (someone added to a shop while signed in).

### The day board

`GET /salon/day?date=` every 30 seconds, on focus and on push. The first read of a date is the whole day
(`full: true`, with `seq`; its ETag and 304 work as before); every refresh after is `&since=<seq>` with the last
answer's `seq` exactly as received, and gets only what changed: `changed` replaces appointments by id (or adds them to
the column of their `staffId`, each column kept by start, then id), `removed` drops ids (unknown ones are ignored), and
`full: true` (the setup changed, an old or unknown cursor, many changes) replaces everything (`src/api/dayBoard.ts`).
A delta that can't be applied (another date, a barber without a column) reads the whole day at once. Only the date on
screen is held: opening another date lets go of the others (their whole-day answer stays in the client's ETag memory,
so coming back is a 304 when nothing changed). Delta answers are never kept for `If-None-Match` (each address is
new). A barber gets only his own column. A failed refresh keeps what was showing and its `seq`, with a
note. The day also says which barber profile is the caller's (`myStaffId`): a barber acts only on his own column
(even when walk-in access shows him everyone), and his "Add break" is always for himself. Every action in the appointment sheet locks its buttons while it runs and reloads the day afterwards,
whatever the answer, because a refusal usually means someone else (the customer, another staff member) changed it
first. If a refresh no longer has the open appointment on that day (the customer moved it), the sheet stays and
says so. The board's "today" and the no-show time move on by themselves while the screen is open: the date by a
timer at India midnight (and a check when the app comes back to the front), the no-show time by a clock inside the
sheet only. A link `/salon/day?date=…&open=<id>` (Bookings, the "in the way" lists) opens that appointment once the
day is read, or says it isn't on that day any more.

Big salons (50 barbers, 2,000 bookings a day): with more than 6 barbers the board opens on the first barber's column
with a booking or walk-in that day ("Everyone" if nobody has one, and a tap away), because one barber's day is a few dozen cards. Cards are memoised (`AppointmentCard`, one
stable handler) and their times are worked out once per appointment object; a refresh keeps the objects of unchanged
appointments (TanStack Query's structural sharing and the delta merge), so only changed cards are drawn again.
Off-screen cards skip layout and paint (`content-visibility: auto`). Virtualising the list was not needed for that and
would break find-in-page and the browser's own scrolling.

Walk-ins carry an `Idempotency-Key`, one per walk-in: the same key on a retry gives back the same walk-in, and a
new key is made when the services or the barber change.

### Bookings: pages, refreshes and long lists

The coming-up list and the history come 100 at a time (the backend's keyset pages): "Show more" asks for everything
after the last booking shown, sending its `startsAt` and `id` (the history: the answer's `next`) back exactly as
received. A short page is the last; when exactly 100 were left, one more (empty) page ends the list. A failed page or
a tap while offline keeps the list and says so; focus moves to the first new booking (or to the count when a page
brought nothing) and the button stays focusable while loading (`aria-busy`). The history's totals cover the whole
range on every page, so they come from the first page.

Coming up is kept fresh with deltas (backend README, "Upcoming list deltas"; `src/api/upcomingList.ts`): before its
first page the app asks `GET /salon/upcoming?since=start` for a `seq`, then loads pages as before; every 60 s and on
return to the app it asks `?since=<seq>` once for the whole loaded list. `changed` bookings replace or join it in
order (`startsAt`, then `id`), `removed` ids leave; each page keeps the cursor it came with, so "Show more" goes on
exactly where the loaded list ends, and a booking that now sorts after that end (when more pages exist) is left for
"Show more". `full: true` (setup changed, an old or unknown `seq`, a new day) or an older backend without deltas: every
loaded page is asked again as below. A failed poll keeps the list and its `seq`. A poll that comes while a page
of the list is loading ("Show more", a reload) is skipped: that load puts back the pages it started from, so a delta
applied meanwhile would be lost; the `seq` stays and the next poll carries it. On `full: true` (and every load of the list) the new
`seq` counts only once every page of that load is in; until then there is none, so a failed reload is asked again (and "Try again" under the list does it now). Polling
stays on after a failed reload.

After a change (an action in the app, or a message): only what it can affect is read again (`refreshSalonWork`): the
day in view (one delta), the coming-up list when open (one delta, never every page), the history and closed days or
setup when the change is about them; a message about the shop reads the shop and hand-over requests only.

Refreshing a paged list (the history on return to the app, or coming up on a whole reload) asks every loaded page
again, one after the other, so the pages stay joined with nothing missing or twice. The cost stays small: each page has its own ETag,
so an unchanged page is a 304 after one primary-key read on the backend; and at most 5 pages (500 bookings) are
loaded for coming up and 10 (1,000) for the history, after which the screen says where to look instead (a day on
Today, or fewer days) — only when something really comes after: coming up asks the page after the cap once to know
(exactly 500 left: no note), the history has its `next`. We did not use TanStack's `maxPages`: it drops the first (soonest) page from the top and the
backend has no "page before" to bring it back. Refreshing only the first page would leave a gap or a repeat at its
end whenever a booking is added or ends.

Cards are drawn only near the screen (CSS `content-visibility: auto` on each card): with up to 1,000 cards the
browser skips laying out and painting the ones far away, but they stay in the page, so find-in-page, focus and
screen readers reach all of them, and nothing needs measuring. A windowing library would keep fewer elements, but
breaks those and needs fixed heights; at these sizes `content-visibility` is enough on a phone (where it isn't
supported, the list is simply drawn in full).

The inbox loads at most 10 pages of 30 (300 messages) for the same reason: a refresh after marking read asks every
loaded page again.

### Shared phones

When a session ends (sign-out here, sign-out or someone else's sign-in in another tab, or the backend refusing a
refresh), `forgetThisPerson` clears the cached data, where they were going, an unsaved registration (which is also
tagged with who typed it) and the notifications still in the tray.

### Times

Every date and time is India time (`lib/ist.ts`), whatever zone the phone is set to. Leave covers whole India days:
the first day's 00:00 to the 00:00 after the last day.

### Notifications

The inbox asks for `app=partner` (salon and shop messages only). Push is per person, not per app, so someone who
is also a customer can get a customer message on this phone: the service worker opens only this app's pages
(`/salon/*`, and `/shops/*` as the start) and otherwise the board.

### Copied from the customer app

Since 0.3.0 the client also keeps the last answer to each read in memory (per person, at most 200 addresses, forgotten
on sign-out) and sends its ETag back as `If-None-Match`: the day board (every 30 s) and the coming-up list (every
60 s) carry the backend's own tag (`"s1-…"`, from the salon's change counter) and an unchanged one is a 304 with no
body. The tag is opaque to the app.

`src/api/client.ts`, `errors.ts`, `auth.ts`, `push.ts`, `src/store/session.ts`, `src/lib/{ist,money,phone,storage,device}.ts`,
`src/components/{ui,CodeInput,Turnstile}.tsx` and `src/features/auth/*` are copies of the customer app's, with
the storage keys renamed (`adp.*`) and the wording changed for partners. A fix in one should go to the other until
the admin app makes a shared package worth it.

## Deploying

Railway (a service that builds from `main`). `railway.json` picks Railpack, which sees a Vite site
(no `start` script), runs `npm run build` and serves `dist/` with Caddy, using this repo's `Caddyfile` instead of its
default: every address that isn't a file gets `index.html` (single-page app), `/health` answers 200, and every answer
carries the security headers. Keep the service's Start Command empty in Railway's settings: a start command turns
Caddy (and the headers) off. Set `VITE_API_URL`, `VITE_TURNSTILE_SITE_KEY` and optionally `VITE_MAP_TILES` as the
service's variables (they are read at build time), `PHOTO_ORIGIN` (in production the account's exact
`https://<account>.r2.cloudflarestorage.com`, so the policy names only your R2 address; default
`https://*.r2.cloudflarestorage.com`, where signed photo links point). Then add the site's address to the backend's
`CORS_ALLOWED_ORIGINS`.

### Security headers

`security-headers.ts` works them out from the build's variables; the build writes them to
`dist/security-headers.caddy`, which the `Caddyfile` imports, and `vite preview` (the end-to-end tests) sends the same.

| Header | Value |
| --- | --- |
| `Content-Security-Policy` | `default-src 'self'`; scripts from the site (plus `https://challenges.cloudflare.com` when the Turnstile key is set, also its frame); API calls (and photo uploads) only to `VITE_API_URL`, and the salon video's upload to R2 (`PHOTO_ORIGIN`); video playback (`media-src`) from the site, `blob:` and `PHOTO_ORIGIN`; images from the site, `data:`, `blob:` (a photo just taken), `PHOTO_ORIGIN` and the map tiles' server; styles allow inline (the map pin, the Turnstile widget); no plugins; `frame-ancestors 'none'` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-Content-Type-Options` | `nosniff` |
| `Permissions-Policy` | `geolocation=(self)` (the salon's pin); camera (photos use the file picker), microphone, payment and the rest off |

CI's `headers` job builds as for production, starts Caddy with the `Caddyfile` (the build at `/app/dist`, as on
Railway) and checks every header on the app, a deep link, `sw.js`, the manifest and the offline page
(`scripts/check-headers.mjs`). The dev server sends none (hot reload needs inline scripts).

### Installing and offline

`public/manifest.webmanifest` ("Clozest Partner", short "Clozest Pro") lists the SVG icon and PNGs (192, 512,
maskable 512) plus `apple-touch-icon.png` for iPhone, all made from `public/icon.svg` by `npm run icons` (sharp);
commit the PNGs after changing the SVG. `public/sw.js` keeps a small offline page (`offline.html`, its CSS and the
icon): opening the app without a connection shows "You're offline" with "Try again". Nothing else is cached. A new
version of `sw.js` waits after installing; the app shows "New version available — Reload" and only that button
switches over. Change `OFFLINE_CACHE` in `sw.js` when the offline page changes.

Until the admin app exists, nobody can approve a salon: for a first real test, approve it by hand in the database
(set `shops.status` to `APPROVED`).

## Languages

The app is in English, Hindi, Telugu, Marathi, Tamil and Kannada. The language is chosen on the sign-in screen (each
shown in its own script), offered once to everyone already signed in (a box at the top of every tab), and changed
any time under More → Language; it applies at once, keeps whatever was typed,
and is remembered on that phone (`localStorage.language`), not on the account: an owner and a helper can each use
their own.

- **Where the words are.** `src/i18n/<language>/<area>.json`, the same keys in every language. English is in the main
  download; each other language is one download of its own (about 35 KB gzipped), fetched when chosen. A text a
  language lacks shows in English. Blanks are `{name}`; counts use `{ "one": …, "other": … }`.
- **In code.** In a component `const t = useT()` then `t('shop.homeTitle')`; outside React `t()` from `src/i18n`,
  called when the text is needed (never kept in a module-level constant, which would not follow the language).
- **The backend's messages.** `messageOf(e)` looks for the app's words for the error's code (`error.json`), then for
  the backend's exact English message (`server.json`: its keys are those messages), else shows the message as it
  came. Messages the backend builds with names, numbers or lists in them (a barber busy until a time, "must be 2 to 40
  characters", hours outside the salon's), and push notifications and the inbox, are still in English: they need
  the backend to send the values separately and to know each person's language.
- **A new version while the app is open.** Choosing a language whose file is gone (renamed by a new deploy) reloads
  the app once into the new version. Offline at start-up, the app shows English until it is back online.
- **Dates and numbers.** Day and month names follow the language (`Intl.DateTimeFormat`); digits stay 0-9 in every
  language, so prices, counts and phone numbers read as on bills and packs.
- **Not translated.** The legal pages (About, Terms, Privacy, Refunds, Delivery, Contact) stay in English, the
  language they are binding in. Names people type, and everything saved, stay as entered.
- **CI check.** `src/i18n/i18n.test.ts` fails when a language lacks a text English has, has one English doesn't, an
  empty one, or different blanks.
- **Fixing a word.** Change it in that language's JSON file and open a PR; nothing else needs touching. The first
  translations were written by AI and should be read once by a native speaker of each language
  (`docs/translation-review.md` lists what to look at first).

## Changelog

### 0.28.0 — 2026-11-19

- **Languages:** the whole app in Hindi, Telugu, Marathi, Tamil and Kannada as well as English, chosen on the
  sign-in screen, in a one-time offer to everyone signed in, and under More → Language (see Languages above). About
  1,530 texts per language, and about 250 of the backend's fixed messages. Messages with names or numbers in them,
  and push notifications, stay in English for now. No backend change is needed.
- A field's reason is no longer compared with English text to recognise "your own number" (hand-over): the
  backend's field detail is checked directly, so it works in every language.

### Kirana branch — 2026-11-20 (not released; `kirana-partner` only)

- `main`'s languages (0.28.0) merged in. The screens both branches had changed (start, registration, Home, Profile,
  the shop video and licence, the re-check notice, the tabs) keep the salon's translated words and get their own
  kirana words (about 70 new texts, in all six languages), chosen by the shop's kind. The kirana-only screens
  (counter, bills, products, khata, kirana registration) are still in English: they follow in the next round.

### Kirana branch — 2026-11-18 (not released; `kirana-partner` only)

Needs the backend's `kirana` branch with `PUT /shops/me/type`, `PUT /kirana/settings/sells-food`, a kirana's video
and licence, and V74–V75 (backend PR #71); deploy the backend first.

- **"What do you run?"**: Start now says "I own a shop", and the first question is Kirana / general store or Salon /
  barber shop. Every registration step shows the kind with **Change**, any time before Submit. Changing asks first and
  says what stays (photos, video, a trade licence, checked again for the new kind) and what goes (a Shops and
  Establishments certificate, a kirana's only, when changing to a salon). A UPI ID or food answer stays saved in case
  they change back. Locked after Submit, and for good once the shop was approved.
- **Kirana registration, five steps**: Details (a shop's words, optional GSTIN), **Photos and video** (the same
  15–45 second video as a salon's, of the shelves and counter), **Licences**, **UPI ID** (checked on the phone, shown
  as it will be saved), and Submit. Coming back opens the first step not done.
- **Licences step** (also More → Licences after registering, owner only, behind the phone code once verified):
  "Do you sell any food items (packed or loose)?". Yes needs the **FSSAI licence** (14-digit number and a photo or PDF
  of the certificate, read automatically; one still being checked lets them go on, a refused one doesn't; the same
  certificate again after a refusal asks a person to look at it). Without a licence yet, "Don't have an FSSAI licence
  yet?" says where to apply (foscos.fssai.gov.in, Basic Registration ₹100 a year) and that everything stays saved. No
  needs nothing. Optional: a **trade licence or
  Shops and Establishments certificate**, checked automatically against the shop's name and address (customers will
  see "Licensed").
- **Kirana counter** (`/kirana/counter`): scan with the camera (or type the digits); a carton adds its pack; search by
  name or barcode digits; loose items by weight or by ₹; items not in the list; − / + / Change / Remove; a discount
  (a helper up to ₹10); **Cash**, **UPI** (the QR drawn on the phone with the amount) or **Khata** (search the book or
  add a customer on the spot, the limit shown, part paid now). An unknown barcode can be added as a product (it comes
  back onto the bill), linked to one already there (with its pack), or billed without a product. The bill being made
  survives a reload; a Save whose answer never came offers only **Try again** with the same payment (billed once),
  and nothing on the bill can change meanwhile. **Clear bill** after a question; at most 100 items a bill. A product
  scanned again brings its current price. The receipt warns when the saved total differs from the one shown, works
  out the **change** for the cash handed over, and a failed UPI can be marked **paid by cash instead** in one tap. A
  khata over its limit gives the owner a link to change it.
- **Bills** (today's totals on top, then every bill) with cancel (quick reasons), items brought back (refunded at the
  bill's discounted share) and a payment change (not after items came back); **the day's totals** (the drawer and UPI
  first, cancellations taken off) for any day. A helper's own bills are known by who made them, not by name.
- **Products**: add with barcode, pack, stock and alert; came in, damaged and count; barcodes; running out; the owner
  edits, removes and restores.
- **Khata**: who owes (totals, only who owe, search); they paid (more than owed: the extra kept as advance, with the
  advance after); undo a payment recorded by mistake; WhatsApp reminder ("Add mobile" when there is none); the owner's
  limit (also when adding a customer), advance back and taking out.
- **Money and stock sends whose answer never came** (a khata payment, an advance given back, stock came in / damaged /
  count, items brought back) are kept in the tab: closing the sheet and opening it again retries the very same send
  (recorded once), with the values locked, until it is saved or they say it wasn't. Someone else's change meanwhile
  (BILL_CHANGED, KHATA_CHANGED…) reloads the screen.
- **Add a product**: what was typed survives leaving the screen; a name already taken with a barcode typed offers to
  put that barcode on the product they have.
- A kirana's **helpers bill from the day it is submitted**, as the owner does (the counter works before approval).
- **Second review round:** a retry refused for good (a product removed, a limit reached) unlocks the bill; an unsure
  khata bill closes its sheet so only the safe "Try again" is offered; a full bill says so instead of "added"; a loose
  product added from the counter opens its weight sheet there; **Show the UPI QR again** on a UPI bill; the "keep as
  advance" questions show their errors; a product edit refused because it changed elsewhere keeps the sheet and the
  typing; the bill being made is kept **per person and shop**, so an unsure one on a shared phone is never overwritten;
  Add a product's typing is forgotten at sign-out.
- **Licences:** the FSSAI picker waits for the 14-digit number; while a person checks it the backend's words are shown
  and it is read every minute (not every 8 s); the shop paper's kind can be changed on the spot; Remove asks first.
  "Got it, hide this" on "What happens next"; **Tell them on WhatsApp** on a helper invitation; "Use the customer who
  has this number"; a helper is told only the owner edits a product; a full-size day picker; a kirana's video and edit
  screens speak of the shop.
- **Team** for a kirana (invite helpers, cancel invitations, remove), and **UPI ID** in More (owner; a verified shop
  asks for the phone code first).
- A kirana's people see only kirana screens and a salon's only salon screens. The "Kirana partners: coming soon"
  screen is gone.
- New libraries, both loaded only when first used: `qrcode` (the UPI QR) and `@zxing/library` (barcodes where the
  browser can't read them itself).

### 0.27.0 — 2026-11-16

Needs the backend with V65 (the salon subscription); deploy the backend first.

- **Salon subscription (₹500 a month after a 30-day free trial)**, paid only by the owner, in this app:
  - **Subscription page** (`/subscription`, `src/features/subscription/`): price, trial and paid-until dates, and for
    the owner **Set up AutoPay** (during the trial: approve once with the UPI PIN; nothing taken until the trial ends)
    or **Pay ₹500** (after it). Opens Razorpay's checkout (`src/lib/razorpay.ts`) in Clozest's name, logo and navy
    (#0B0F26), the owner's details filled in, then confirms with the backend. Helpers and barbers see it read-only.
  - **Never paying twice by accident:** if the approval reached Razorpay but not us (network), the page says "we're
    checking it, please don't pay again" with **Check again** (the same signed answer) instead of the Pay button.
    After a checkout the page reads the subscription every 5 seconds for 90 seconds, so a payment approved in the UPI
    app shows up by itself. A failed payment says "if money was taken anyway, it shows here within a few minutes".
  - **Today banner**: the owner in the last week of the trial or paid month ("Set up AutoPay", nothing taken before
    then), at once when an AutoPay payment failed, and once it has ended ("pay by <day>": the last day before
    customers stop finding the salon at midnight). Helpers and barbers are asked to remind the owner during the 3
    days, and told when customers can't find the salon. Standing states are shown, not announced as alerts each time.
  - **More**: a Subscription card (tap anywhere on it) with its state in one line; not for a suspended salon, whose
    page says paying doesn't lift a suspension.
  - **Stopping AutoPay** explained plainly: in the UPI app (PhonePe, Google Pay, Paytm…), or ask us when paid by card
    or netbanking; "you keep the month already paid". The same on the Refund policy and About pages.
  - **Content-Security-Policy**: allows Razorpay's checkout script, frames, calls and images, and the Payment Request
    API for its frame; nothing else changed. The checkout script gives up after 20 seconds instead of spinning.

### 0.26.1 — 2026-11-15

- **Full business address on the Contact page**: the Udyam-registered
  address with its PIN code, as Razorpay's website check asks for, in place of just the city.

### 0.26.0 — 2026-11-15

- **Public pages for Razorpay's website check**: salons pay the subscription in this app, so partner.clozest.in is
  the website registered with Razorpay. About ("Clozest for salons": what salons get, **₹500 a month after a 30-day
  free trial** from field approval, UPI AutoPay/card/netbanking, cancel any time), Contact, Terms, Privacy, Refund
  policy (no refunds; cancelling stops the AutoPay mandate from the next month) and Delivery (nothing shipped), open
  without signing in. Each says "Clozest is operated by Premanshu Jha, a sole proprietor", the name on the Razorpay
  account. Business details live in one place, `src/lib/business.ts`.
- **A first-time visitor opening partner.clozest.in sees About first** instead of the sign-in form. Anyone who has
  signed in on this browser before (signed out, session ended, the installed app) still goes straight to sign-in.
  Back on a public page opened from a link goes to About (the start when signed in) in its place, so the phone's Back
  can't loop; `Page` got `backReplace` for that.
- Links to the pages at the bottom of sign-in, More and every public page.
- Test fix: "a service's picture comes with it…" waits for the saves to reach the fake backend (it failed now and
  then, on main too).

### 0.25.0 — 2026-11-15

Needs the backend with V63–V64 (the second set of service pictures). Deploy the backend first.

- **Service pictures, second set** (28), each checked with a blind recognition test: fresh reviewers named the
  service from the picture alone, at phone size, and the ones they couldn't name or mixed up were redrawn or merged.
  New: **trim** (an electric clipper, apart from the haircut's scissors), **moustache** (beard is now a real beard),
  **head massage** (a hand on a head: champi, maalish, oil massage; body massage keeps the person lying down),
  **braids**, **waxing** as a wax pot, **bridal/groom** as wedding rings, **shave** as a razor, **hair wash** as
  shampoo, **body spa** as a lotus. Clean-up and de-tan share the facial's picture, nail art the manicure's (nail
  polish), hair treatments the hair spa's. The general picture, for anything none of them shows (saree draping,
  tattoo, hair extensions…), is a **salon chair**. Labels in the picker name the service; Hindi in English letters
  and Devanagari are read as before (चोटी, मूंछ, मालिश, हेड मसाज added). Words that only hint ("relaxing", "party",
  "head", "treatment") give way to the service ("Body maalish" is a body massage, "Upper lip wax" waxing). A saved
  picture this app doesn't know (a newer backend's) is drawn as the one the name fits, and never sent back.
- **A picture comes with every service**: ticked from the list, it has its own, with nothing to choose; typed in or
  edited, the sheet shows "Picture: …", with "Change" only when the name fits more than one (a "Beard trim": beard,
  clipper or scissors).
- **Once per phone**, Salon → Services says the pictures are new and that tapping a service shows or changes its
  picture.

### 0.24.0 — 2026-11-14

Needs the backend with V61–V62 (walk-ins at the offer price, service pictures). Deploy the backend first.

- **Walk-in total at the bottom**, always there: "Tick what they want", then "Total: 2 services · ₹300" and "About 45
  min", following every tick and untick. Once a barber is picked, "Start now with …" sits under it, so a long list
  needn't be scrolled to the end. At most 10 services: the rest grey out and the screen says why.
- **Walk-ins get the salon's offer** while it runs (as bookings do): each covered service shows its own price crossed
  out and the offer price, "offer till 2:00 PM" (screen readers hear "was … now …"), and the total too. Prices are
  read again every minute and after any offer or service change. The total shown goes with the walk-in: if the price
  changed meanwhile (an offer started or ended), nothing is added and the screen says the new total, then Start adds
  it. Prices that can't be read show the usual ones with "Couldn't check the salon's offer… Check again".
- **A picture for every service** (thin-line SVG, 26 of them: haircut, beard, shave, hair colour, styling,
  straightening, curls, spa, hair wash, facial, clean-up, massage, threading, eyelashes, waxing, manicure, nail art,
  pedicure, make-up, bridal, kids, mehendi, body spa, piercing, package, and the general one; replaced in 0.25.0). Shown
  in Salon → Services, registration and walk-in. When adding or editing a service (and for every service ticked or
  typed in at registration), only the pictures that fit its name are offered, labelled by service, plus the general
  one; the best fit is picked, so nothing has to be done; arrow keys move the pick. Names are read in any case, word
  order, spacing or punctuation ("massage Head", "hair.cut", "MAKE-UP"), Hindi in English letters (dadhi, champi,
  mehndi) and in Devanagari (बाल कटिंग, मालिश). A word that only hints ("spa", "oil", "boy") gives way to the
  service ("Spa pedicure" is a pedicure, "Boy cut" a haircut). Editing only the price keeps the saved picture.
  Most drawings are from Lucide (ISC licence); the salon-only ones are drawn for Clozest in the same style.

### 0.23.0 — 2026-11-14

Needs the backend with V55–V58 (the trade licence checked automatically). Deploy the backend first.

- **Trade licence instead of a registration document.** Registration (Photos and papers) and More → Salon → Trade
  licence take one optional upload: a photo or the PDF of the salon's municipal trade licence. No choice of kind any
  more (only a trade licence counts); a Udyam or Shops and Establishments certificate added before says to replace
  it, with "Check it again" if it really is a trade licence.
- **Checked automatically, not by a person.** Right after the upload: "Checking your trade licence…" (usually under
  a minute; the owner can leave). The page reads the salon again by itself every 8 seconds while it shows a licence
  being checked, then says "Checked: customers see Licensed on your salon until 31 Mar 2027", or "Not accepted" with
  why and what to do (blurred, not a trade licence, edited, no number, another trade, no dates, expired, name or
  address not matching, another salon's). A message comes either way (`SHOP_LICENCE_PASSED` ✓,
  `SHOP_LICENCE_FAILED`). An expired one says so and asks for the renewed licence.
- **Customers see "Licensed"** (no badge without one) instead of "Registered" / "Unregistered". The Salon tab, More
  and the review step say where the licence stands in a line.
- **No GSTIN or Udyam number for a salon**: the boxes are gone from Salon details and registration, and from More.
- **Changing the name, owner or address** of a salon whose licence passed says first that the licence is checked
  again against the new details ("Save and check the licence again"); the salon stays open meanwhile.
- **Check it again** shows only when that can help (the name or address didn't match, or it wasn't read); a not-
  accepted answer shows what was read from the licence, and a check taking over 10 minutes says so with a "Write to
  support" link. Messages come 30 days before the licence ends and the day after it does.
- Tests: the fake backend answers the licence check like the real one (`finishLicenceCheck`), the e2e build reads the
  salon again every second (`VITE_LICENCE_POLL_MS`); unit tests for every state and reason.

### 0.22.0 — 2026-11-14

Fixes from a salon owner trying the app (no backend change needed):

- **"Waiting for approval" everywhere** while the field team hasn't approved the salon: a bold bar at the top of
  every tab and every salon screen (walk-in, time off, services, hours…) says customers can't book it yet, so nothing
  looks like a live salon's. Today's card under it is now "What happens next" (the call, the visit, the shop code).
  Helpers and barbers of such a salon see "Waiting for approval" too (of a draft: "still registering").
- **Submit asks once more**: "Submit for the visit" opens "Submit for the field visit?" with the salon's name,
  address, services and open days and what happens next; "Not yet" (first) or Escape sends nothing, "Yes, submit"
  sends it once, even with two taps at once.
- The big-salon speed test (2,000 bookings) times only the app's own drawing, inside the page (about 0.2 s, limit
  5 s): the old timing included Playwright's polling and failed now and then on a busy CI runner.
- **Change number:** a wrong-code (or other) message now always gets the focus, so screen readers read it (it was
  sometimes lost).
- Tests: the fake backend refreshes like the real one (a tab reloaded mid-refresh stays signed in), which ends the
  change-phone and email tests that failed now and then.

### 0.21.0 — 2026-11-13

- **Any kind of file with a support request** (needs the backend's round-5 helpdesk, V54), as in the customer app:
  Word, Excel, zip and other files up to 10 MB, an iPhone HEIC photo as a file; shown as a download, a PDF with a
  "Download" link too.
- A resolved request (and a tab in the background) is no longer re-read every 30 seconds; a playing video keeps its
  place when its link is renewed.

### 0.20.0 — 2026-11-13

- **Files sent by email show in My requests** (needs the backend's round-4b helpdesk, V52–V53), as in the customer
  app; any other file is counted ("📎 1 more file sent by email…").

### 0.19.0 — 2026-11-13

- **Photos, videos and PDFs with a support request** (needs the backend's round-4a helpdesk, V49–V51): "📎 Add photo,
  video or PDF" on Need help and in My requests, as in the customer app: up to 5 per message, photos shrunk on the
  phone, videos up to 100 MB straight to storage with progress, Send waits for them, words optional with a file.
  Support's files show in the request. Files are deleted 6 months after a request is resolved. An iPhone HEIC photo
  the browser can't read, a 6th file and a video over 100 MB are refused at once with what to do.
- **Signing out forgets what was typed** in Need help and My requests (a shared phone).

### 0.18.0 — 2026-11-13

- **"Support replied"** (needs the backend's round-3 helpdesk): when support replies to a question sent from this
  app, it shows in Notifications ("✉ Support replied on CLZ-1042") and as a push; tapping either opens the request in
  My requests. The email still comes too. Only the ticket number shows, never the reply or the subject (a push can show on a locked phone).

### 0.17.0 — 2026-11-12

- **My requests** (needs the backend's round-2 helpdesk): More → "My requests" (also linked at the top of Need help)
  lists what you asked support with its status. Open one to read the whole conversation, support's replies included
  (also sent by email), and add to it in the app; writing on a resolved request opens it again. What you type is kept
  until it's sent. After sending a question, "See it in My requests" opens it. The arrows never go round in a loop;
  a send repeated after a lost answer is kept once; the character count matches the backend's.

### 0.16.0 — 2026-11-12

- **Need help** (`/help`, needs backend V46): owners, helpers and barbers write to support in the app; it becomes a
  ticket (CLZ-1001) and the reply comes by email. Support sees their salon and role with it, so no shop code is
  needed. What is typed is kept until it's sent; a double tap sends once. More's help card opens it ("Write to
  support", the address still shown), and so does the kirana "coming soon" page.
- The support address is **support@clozest.in** (it was a domain we don't use).
- Sign-up is unchanged: the email is still asked right after the phone code.
- After review: Need help is also on every registration step, the not-live page and Start; the draft is kept per
  person; an email no longer verified reads the profile again instead of bouncing; the support address is a mail link.
- Scenarios 362–370 added in `docs/scenarios.md`.

### 0.15.0 — 2026-11-12

- **The edit code is per device** (needs backend V45): a code entered on this phone unlocks editing on this phone
  only; another phone signed in to the same account asks for its own. Nothing changes on screen.
- **Closing or handing over a verified salon needs the code too**: Close and Hand over have the same bar and code
  sheet as the edit screens (`EditGate ending`: "this needs a code", Get the code, Confirm); what was typed (the
  reason, the tick, the number) stays while the code is entered, and no red "confirm with the code" is left behind.
  A draft asks for nothing.
- Scenarios 358–361 in `docs/scenarios.md`.

### 0.14.0 — 2026-11-12

- **A verified address is locked** (needs backend V41): once our field team approved the salon, the address fields
  are read-only, there is no GPS or address search, and the pin shows as a map (`addressLocked` on `GET /shops/me`).
- **Request address change** (needs backend V44; `AddressRequest.tsx`, `RegisterDetails` in request mode): from Salon
  details or the salon card in More, the owner types the new address and places the pin (GPS, address search, drag)
  and sends it to the field team. The salon keeps its old address, live and bookable, until they approve it. The page
  shows a waiting request (change it, or Cancel the request) and a declined one with the reason. New message
  `SHOP_ADDRESS_DECLINED` (opens the page); `SHOP_ADDRESS_CHANGED` now has its icon.
- **One code before editing a verified salon** (`EditGate.tsx`): on Salon details, Photos and video, Registration
  document and Request address change everything can be read and typed, and a bar says changes need a code, with
  Start editing (More's Edit opens the code sheet straight away). One code opens every edit for 15 minutes ("Editing is
  on until … · Done"), counted from the backend's `secondsLeft`, not the phone's clock. If the time runs out while
  typing, the sheet comes up over the form (the client sends `clozest:edit-locked` on 403 `EDIT_LOCKED`); closing it
  keeps what was typed. A salon still registering (a draft) asks for nothing; services, hours, barbers and offers
  never do. Reading or cancelling an address request needs no code.
- **Salon info for barbers** (`SalonInfo.tsx`, More → Salon info): the offers on now or coming, the opening hours and
  the services with price and time, read only.
- Messages: a fix the field team asked for (`SHOP_FIX_ASKED`, `/setup`) now opens the Salon tab (`safePath` refused it).
- **A live salon stays live while our field team re-checks a change**: a new photo, video, GSTIN or Udyam number no
  longer hides the salon or locks its helpers and barbers out. The owner sees "Our field team is checking your changes
  since …" (`RecheckWaiting`) on Today, Salon details and Photos, and in More; a fix the team asks for shows with its
  reason. New messages: `SHOP_RECHECKED`, `SHOP_FIX_ASKED`, `SHOP_ADDRESS_CHANGED`. A GSTIN or Udyam change asks first.
- **Photos fixable on the spot** (`PhotoPicker`): Take photo / Choose from gallery under each photo, Retake / Choose
  another once one is there, Try again after a failed upload (the same photo), busy from the pick, a clear message for
  a HEIC photo, a leave warning while uploading; a barber's photo opens the back camera.
- **Registration picks up where the owner stopped** (`Home`): the first step not done, or the review (with the field
  team's reason, now on every step). The step pills are links; "Edit details" and "Change" from the review come back
  to it. The review shows the pin on a map and small photos.
- **The salon card in More**: full address, owner, GSTIN and Udyam (owner), shop code with Copy, Edit, Photos and
  video, Registration document, the pin on a map; nothing cut off; Back returns to More. **Closed days, Offers and
  Ratings** also in the Salon tab; every hint says "the Salon tab →".
- **Salon details**: GSTIN and Udyam checked on the phone as the backend does (`src/lib/gstin.ts`; spaces in an Udyam
  number become dashes), leaving with unsaved changes asks first (and nothing counts as unsaved right after Save),
  re-taking the location asks to check the address, both name fields say which is which. A map that can't load says
  so instead of failing the screen (`MapBoundary`).
- Scenarios 253–254 updated, 313–357 added in `docs/scenarios.md`.

### 0.13.0 — 2026-11-11

- **The logo's orange in the app.** Offers ("20% off" on running and upcoming offers, the new offer's preview), star
  ratings (they were the warning yellow) and new messages (the bell's count, the unread dot) use the accent orange.
  `src/theme.test.ts` checks navy on orange and text on an offer card are AA.
- The service picker's offer prices and unread messages' cards are orange too.
- Scenarios 311–312 in `docs/scenarios.md`.

### 0.12.0 — 2026-11-11

- **New look from the Clozest logo.** The theme's colours (`src/index.css`) now come from the dark logo: background
  `#0b0f26`, surfaces `#121736`/`#1a2048`, the logo's blue `#3d5bff` on buttons, borders and focus rings (the main
  button fades into the pin's violet `#5b21e6`, with a soft blue glow), links `#8c9cff`, and `#ff8a1f`, a lighter cut
  of the logo's orange `#ff7a00`, as the highlight colour (it was sky blue). `src/theme.test.ts` checks the theme's
  text and button pairs are WCAG AA, now including white on the violet end of the button, and that brand blue is
  never used as text (it is under 4.5:1 on the navy; text in the brand's colour uses link).
- **The logo** (`src/components/Logo.tsx`) is drawn in code on the sign-in screens: the location pin is the "C", then
  "LOZEST" and the orange sparkle. Screen readers hear "Clozest Partner".
- **Poppins** (600, 700) for the logo and screen titles, bundled with the app (`@fontsource/poppins`), so the security
  headers' `font-src 'self'` still holds. Body text keeps the phone's own font.
- **Icons:** `public/icon.svg` is the new dark app icon; the PNGs, the manifest's colours, `theme-color` and the
  offline page follow. The service worker's offline store is `offline-v2`, so installed apps store the new offline page.
- Scenario 153 names the manifest "Clozest Partner" / "Clozest Pro".
- Scenarios 305–310 in `docs/scenarios.md`.

### 0.11.1 — 2026-11-11

- The day's address searches used up now says when they come back, in India time ("Try again after 11:15 PM", or
  "tomorrow, 9:30 AM": the window is 24 hours from the first search). It said "Try again in 1437 minutes".
- The salon's pin can be moved with the keyboard: Tab to it, then the arrow keys (Shift: further); the map follows near
  its edge, and screen readers hear each move ("Pin moved north.").
- Scenarios 201, 303 and 304 in `docs/scenarios.md`.

### 0.11.0 — 2026-11-11

Needs the backend with `POST /auth/me/phone/send-code` and `POST /auth/me/phone`.

- **Change your mobile number** (More → Mobile → Change): a code to the new number, and a second one to your email
  (or, without one, to your current number). The same account moves to the new number (the shop, your role and its history stay); other devices are
  signed out, this one carries on. A number that already has an account is refused.
- A refresh on its way while the number changes waits for the new tokens instead of signing out (`replacingSession`).
- A lost answer after the change went through: the sign-in screen says the number probably moved and fills it in.
  This device's notifications are registered again after the change; the "number is now …" notice shows once.
- Scenarios 292–302 in `docs/scenarios.md`; end-to-end journey in `e2e/change-phone.spec.ts`.
### 0.10.0 — 2026-11-11

Needs the backend with V37–V39 (salon offers).

- **Offers** (More → Offers): a discount the owner publishes whenever he likes, for quiet days or hours.
  - *New offer*: the discount (10–30% in one tap, or any 5–50%), all services or some (each shows its price crossed
    out next to the offer price), the first and last day, and "Only some hours" with a start and end time (the
    salon's opening hours shown next to them; the backend refuses hours outside them, naming the days).
  - The form checks itself first (the discount, a service picked, the days, both times); "See preview" then shows
    both prices of each service and how many past customers the message goes to; any change asks for a new preview.
  - "Publish and send": the message goes straight away to the salon's past customers who haven't turned offers off;
    the list then says how many. An overlap with another offer on the same services is refused with its name (a
    double tap too, so nobody is told twice).
  - *The list*: each offer's discount, services, days and hours, "Running", "Coming up", "Ended" or "Ended early",
    how many customers were told and the bookings it brought. "End offer now" (asks once more): new bookings at the
    normal price, bookings already made keep theirs.
  - The first day must be inside the booking window (customers can book only so far ahead) and the last day at
    most 90 days away; "00:00" as the end time means midnight. A salon that never set its opening hours is sent to
    set them first. A Publish whose answer was lost, tapped again, lands on the list as published.
  - Helpers see the list; only the owner makes or ends offers. Running and coming offers come first in the list, so
    each can be ended however many there are.

### 0.9.0 — 2026-11-10

Needs the backend with V34–V36 (salon registration, opening hours, ratings).

- **Registration in five steps:** Details, Photos (and papers), Services, Hours, Submit.
  - *Registration document*, optional (many salons aren't registered): which one (Shops and Establishments
    certificate, trade licence or Udyam certificate, any one), then a photo (made smaller first) or a PDF up to 10 MB.
    Only the field team sees it; customers see "Registered" on the salon's card with it, "Unregistered" without.
  - *Services*: common services to tick from the list, each with its suggested time and come-back days; a price for
    each; "Add your own service"; all saved at once. Services already saved are listed and can be edited.
  - *Opening hours*: open or closed (weekly off) per day, opening and closing time, "Same times every open day",
    "Open till midnight".
  - *Submit*: the review lists every part with Add/Change; Submit stays off until all are there. Here too: festival
    holidays (optional) and "Do you cut hair here yourself?".
- **Setup → Opening hours.** Barbers working outside new hours are named, with "Cut their hours to fit and save";
  bookings that wouldn't fit are listed. Helpers see the hours. A barber's page has "Use the salon's hours", and hours
  outside the salon's are refused with the reason.
- **Come-back reminder per service.** "Remind customers to come back after (days)" on the service sheet (0 = never);
  the list shows "back in 3 weeks".
- **More → Ratings** (owner and helpers): average, count, what customers liked, and each rating with its comment
  (only the salon sees comments). Customers see the average from 5 ratings on.
- Review fixes: the barbers named as working outside new hours are cleared when the week is changed again (and "Cut
  their hours" is off while a time is wrong), so nobody is cut without being named; a failed read in the background
  no longer replaces the hours being edited; "Saved." goes when the next save starts; the review step says when it
  couldn't read the services or hours (with Try again) instead of "missing", and no "Closed" week before hours are
  set; a service saved by mistake can be removed on the Services step; each price, minutes and days box names its
  service for screen readers; at most 30 services in one save; names that differ only in spaces count as the same; a
  retry that finds the services already saved starts the list again; a failed change of the document's kind puts
  the choice back; a PDF from a picker that gives no file type is accepted by its name; "midnight" instead of
  "12:00 AM" for a salon open till the end of the day.
- **Everything the owner gave at registration is editable later** (the owner only), under More → Salon:
  - *Salon details*: name, owner's name, address and pin, GSTIN, Udyam. A new address or pin on a live salon is said
    first ("goes to our field team for a check"), then saved on "Save and send for a check".
  - *Photos and video*, with the same re-check said at the top.
  - *Registration document*: add, change or remove it; the salon stays live; "Waiting for our team to check it" until
    the field team checks it (customers see "Registered" only then). A document the field team removed comes as a
    message with the reason.
- **Festival holidays at registration:** Check and submit has the closed-days list ("Festival holidays
  (optional)", above Submit). A holiday is the whole salon's, even before any barber is added; barbers added later are
  off that day too. No day is picked until the owner picks one (one tap can't close tomorrow), and a day already
  closed says so. The weekly off is set in the opening hours; leave and breaks stay per barber.
- **The owner as a barber:** "Do you cut hair here yourself?" on Check and submit; "Yes, add me" makes him a barber
  with his own sign-in, every service, the salon's hours and its closed days (changeable like any barber's). Later:
  More → Barbers → "Add me as a barber". A second tap or another phone adding him first shows no error. His own
  profile says "This is you" and has no "Remove his sign-in" (he couldn't invite his own number back); switching it
  off keeps it his, removing it lets him add himself again. If the barbers can't be read, the question says so with
  Try again; the answer is announced to screen readers.
- **Remove a barber for good** (a contract barber who won't come back): "Remove barber" on his page, after moving his
  upcoming bookings. Switching "Working here" off stays the way to pause one who comes and goes; switched back on,
  his hours are cut to the salon's.
- More review fixes: services saved at registration keep the order ticked; the services step keeps the page when a
  background refresh fails; Continue waits for the document upload; a refused service names the service, and a name
  needs 2 letters or digits; the document's kind follows a change from another phone.

### 0.8.0 — 2026-11-09

- The late allowance is 10 minutes (backend PR #44): Start closes, and No-show opens, at the backend's `noShowFrom`
  for each appointment instead of a fixed 15 minutes in the app, so the two never disagree again. The code screen
  says "the hold until 4:40 PM is over".
- Nothing changes for live updates: the day board and the coming-up list already reload the moment a booking message
  arrives (a new booking, a move, a cancel), and check every 30 / 60 seconds otherwise.

### 0.7.0 — 2026-11-08

- Registration step 2: **Salon video**, needed before Submit (15–45 seconds, up to 100 MB, MP4/MOV/WebM). The card
  says how to film it (phone sideways and 1080p (HD) rather than 4K; start outside at the board; walk in and turn
  slowly left to right; lights on; avoid customers' faces), with **Record video** (the phone's camera) and **Choose
  from gallery**, real buttons that open the file pickers. The phone checks the size and length first, by the
  backend's rule (the rounded length 14–46 s), and refuses a clip too short, too long or too big without sending
  anything; if it can't read the length it says so and offers **Upload anyway** (sent without a length). Then it asks
  the backend for a one-time link (`POST /files/video-uploads`) and sends the file **straight to Cloudflare R2** with
  a progress bar and **Cancel**; a send with no progress for 60 seconds counts as a dropped connection.
- **Try again** goes on from the step that failed: a file that arrived isn't sent again, a completed upload isn't
  completed again. The link is kept after R2's own trouble (5xx) and a first dropped connection, and replaced after
  a 403, a second drop or when less than a minute is left (counted from when the link arrived, so the phone's clock
  doesn't matter); an upload the backend no longer knows starts afresh. If someone saved the salon meanwhile, the
  save is tried once more by itself, then the card says to reload.
- While the video uploads, Continue is disabled, the back button and any link inside the app ask first (a link's
  click is caught: the app's router can't hold a route change) and closing the page asks too. Leaving while it is
  being saved stops the save: nothing is set on the salon afterwards. A completed video that expired before it was
  saved (409 `UPLOAD_GONE`) says "This video expired. Upload it again." and Try again starts afresh.
- Afterwards a small player shows it with **Replace video** ("Keep the current video" goes back and clears any
  error). Its link is read again every 4 minutes, but the player keeps the one it loaded; one that can't play gets a
  fresh link once, then "Couldn't play the video. Reload the page.". Progress, checking and saving are told to
  screen readers. The review step shows "Salon video: added / missing" and Submit waits for it.
- Security headers: `connect-src` adds R2 (the upload) and a new `media-src` allows playing it. **In production set
  `PHOTO_ORIGIN` to the account's exact `https://<account>.r2.cloudflarestorage.com`**: it then replaces the
  wildcard `https://*.r2.cloudflarestorage.com` everywhere (a unit test checks it).
- The app can't replace the video of a live salon (the card is only in registration).
- **Needs the backend's salon video (deploy it first) and the R2 bucket's CORS rule for this app's address.**

### 0.6.0 — 2026-11-08

- Registration step 1: **Find my salon on the map**. An owner who isn't standing in the salon fills in the address and
  taps it; the backend (`POST /shops/geocode`, Google's Geocoding API) answers where it is and the pin drops there, to
  be dragged onto the door. "This is only close by…" when Google only knows the street or area, "Check the pin is on
  your door." when it found the building. The button needs the address, area, city and pincode first. "Use my
  location" (GPS) works as before; the last button tapped sets the pin (a slow answer to an earlier tap is dropped,
  and nothing moves a pin the owner dragged). The map starts closer the more exact the pin (18 for the building or
  GPS, 17 for the street, 15 for the area). Editing the address afterwards says to search again or drag the pin. If
  the backend has address search turned off (503 `GEOCODING_OFF`), the button is hidden for the visit and focus
  moves to "Use my location"; not found, too many searches (429 `TRY_LATER`), Google down, a busy backend and no
  network each get a plain message pointing to "Use my location". All location messages come from one polite live
  region; the button is `aria-disabled` (not `disabled`) until the address is filled in, so tapping it says what's
  missing. A GPS failure while a pin is on the map now shows its message (or the guide to turn location on).
  Scenarios 197–206.
- After "Use my location", the address is filled from the GPS point (`POST /shops/reverse-geocode`): only fields
  still empty when the answer arrives, never what the owner typed, with "We filled the address from your location.
  Check it and correct anything that's wrong." Failures are silent (the GPS pin is what matters); not looked up after
  the address search or a drag. Scenarios 207–212.

### 0.5.0 — 2026-11-07

- Security headers on Railway: a `Caddyfile` (Railpack serves the build with Caddy) with CSP, HSTS, Referrer-Policy,
  nosniff and Permissions-Policy, worked out from the build's variables (`security-headers.ts`, including the map
  tiles' server); `vite preview` sends the same, so every end-to-end test runs under the CSP and fails if it blocks
  anything; CI starts Caddy and checks the headers. `railway.json` picks Railpack.
- Delete account for helpers and barbers (More → "Delete my account"): a code by SMS, then delete; the backend's
  BOOKING_SOON, BOOKING_BLOCKED and wrong-code answers shown as they are. An owner sees "Close or hand over your shop
  first", linking to the two screens below; someone without a shop (e.g. after closing theirs) deletes from Start.
- Day board deltas (backend apni-dukan-backend#34, "Day board deltas"): refreshes ask `since=<seq>` and apply
  `changed`/`removed`, or replace everything on `full: true`; only the date in view is held; the whole-day read keeps
  its ETag and 304. See "The day board".
- Coming-up list deltas ("Upcoming list deltas"): a `seq` before the first page, then one `since=` call per refresh for
  the whole loaded list instead of asking every page again; pages keep their cursors (Show more and the 500 cap work
  as before); `full: true` reloads the pages (each with its ETag). See "Bookings: pages, refreshes and long lists".
- Close the shop (owner, More → "Close …"): a clear warning (upcoming bookings cancelled and customers told, helpers
  and barbers lose access, it can't be undone: register again), an optional reason for our team, a tick to confirm;
  then the session is refreshed and Start says the shop is closed. 409 SHOP_CHANGED reads the shop again.
- Hand over the shop (owner): a phone number, the backend's neutral answer ("If that number has an Apni Dukan account,
  they'll see your request."), the waiting request with Cancel; 409 HANDOVER_PENDING shows the one waiting, 429 after
  5 a day, the owner's own number and an invalid number said plainly.
- Requests to take over a shop (`GET /me/handover`): at the top of Start (no shop), of the day board (helpers and
  barbers) and of "not live yet", and on `/handover` (where the "A shop for you" message opens, with or without a
  shop). Accept (with what it means) refreshes the session and opens the shop as its owner; Decline tells the owner.
  409 HANDOVER_GONE says why (cancelled, ran out, closed, another owner, answered) and the request leaves the list;
  ALREADY_IN_A_SHOP says to leave the other shop first; PROFILE_INCOMPLETE re-reads the profile.
- Shop status `CLOSED` (only in the answer to closing) is treated as no shop. Messages `SHOP_HANDOVER_REQUEST`,
  `_ACCEPTED`, `_DECLINED`, `_DONE` have their own icons; a request opens `/handover` (in the app and from a push).
- The history's totals come on the first page only (`null` after): typed so, the first page's kept.
- Review fixes: a coming-up delta is never lost to a page load in flight; polling survives a failed reload, with "Try
  again"; a message or an action reads only what it affects (one delta instead of every page); a draft's owner can
  hand over or close from registration, and staff of a salon not live yet can delete their account; after accepting a
  hand-over the sign-in renewal is tried twice, then "Try again"; a file call answered 403 `SHOP_REQUIRED` renews the
  sign-in once and reads again (uploads send once more).
- A 202 answer's body is read (the hand-over request's message).
- Installable everywhere: PNG icons (192, 512, maskable) and the iPhone icon from `icon.svg` (`npm run icons`), a
  complete manifest named "Clozest Partner"; an offline page when opened without a connection; a new version waits
  for "New version available — Reload" instead of switching silently. The service worker is registered also where
  push isn't offered.
- A refresh answered 409 `TRY_AGAIN` (another tab or request swapped the same token first) uses the newer token that
  was saved and retries the call once; never a loop.
- Dependabot (npm and GitHub Actions, weekly) and `npm audit` in CI through `scripts/audit.mjs`: any high or critical
  advisory fails the build, except one listed there on purpose, with its reason and a last day after which it fails
  again. Listed now: `picomatch` (GHSA-fc5q-39xc-vjpf, no fixed version as of 2026-11-18), until 2026-12-31. Only vite
  and vitest use it, on our own config patterns while building and testing; it never reaches the phone. When a fixed
  version comes out, upgrade and delete the entry.
- Barbers' hours and services: a change refused with 409 `BOOKINGS_IN_THE_WAY` lists the bookings in the way, each a
  link that opens it on its day's board. "Add a second shift" starts an hour after the first (10:00–14:00, then 15:00–20:00; a shift to
  8 PM is split with an hour's break), never overlapping it. The barbers list shows "Invited: +91 …" while a
  barber's invitation waits; cancelling it from Team clears it there at once.
- Bookings: a tap opens the day's board with that booking open (`&open=<id>`); a booking no longer on that day says so.
- The day board for big salons: no 30-second redraw (the date changes at midnight), memoised cards with times worked
  out once, cheap off-screen cards, and one barber's column first when there are more than 6. A test draws 2,000.
- CI: the build job's checkout keeps no token (`persist-credentials: false`), like the other jobs.
- Sign-in codes: 429 `TRY_LATER` (a network that must wait, backend #34's OTP back-off) shows "Too many tries from
  this network. Try again in N minutes." from `Retry-After`; `LOCKED_FOR_TODAY` (now only the guessing network) keeps
  the backend's words.
- Tests: an unchanged bell poll and message list are 304s and change nothing on screen (`inbox-etag.spec`).
- Helpers and barbers join by invitation (backend #34, "Helpers and barbers join by invitation"): Team's "Send
  invitation" shows the backend's neutral answer and a "Waiting for an answer" list with Cancel; a barber's page
  invites his number ("Invited: …, waiting for him to accept", "Cancel the invitation"). The invited person sees "Join
  <shop>?" with Accept and Decline on Start, the day board, "not live yet" and `/invites` (where the `SHOP_INVITE`
  message opens); Accept refreshes the session and opens the salon. INVITE_GONE says why, ALREADY_IN_A_SHOP says to
  leave first. The fake backend answers invitations as ShopInvitesService, and the bell and inbox with their own
  `"n1-…"` ETags. Cursors (`d3…`/`u3…`) needed no change: `seq` is opaque.
- Tests: end-to-end delete account (barber, helper refused, owner), headers, install icons and offline page; unit
  tests of the service worker, the update offer and the 409 refresh.
- Tests: the fake backend's day deltas (a seq per answer and date, full on a setup change or an unknown cursor, a
  barber's own column), closing and handing over as ShopOwnershipService answers; e2e of every new behaviour
  (`day-delta.spec`, `ownership.spec`, coming-up deltas in `paging.spec`); unit tests of both delta merges,
  `keep: false`, the push tap to `/handover`.

### 0.4.0 — 2026-11-06

Uses the backend's scale PR (apni-dukan-backend#33, "Pages (the exact contract)"; merge that first):

- Bookings: coming up and the history come 100 at a time with "Show more" (keyset cursor from the last booking, or
  the history's `next`). A failed page or an offline tap keeps the list and says so; focus moves to the first new
  booking (or to the count); `aria-busy` while loading. The history's "pick fewer days" note is gone (paging
  instead); its totals come from the first page and cover the whole range.
- Refreshes ask only the loaded pages again, at most 5 (coming up) or 10 (history); see "Bookings: pages,
  refreshes and long lists". The note at the cap shows only when more really comes after. Long lists draw only the cards near the screen (`content-visibility`).
- The day board and the coming-up list carry the backend's own ETag (`"s1-…"`); the client's ETag memory (0.3.0)
  treats it as opaque, so an unchanged board or page is a 304.
- Messages: at most 10 pages (300) loaded, then "Showing the latest 300 messages."
- A failed read is retried after the backend's `Retry-After` (503 SERVICE_BUSY: 5 s), not after 1 s.
- Tests: the fake backend pages, orders (to the microsecond), tags and refuses cursors like the real one; end-to-end
  journeys for ties across a page end, exactly 100, a failed and a refused page, offline, focus, refreshes as 304s,
  the cap, the history's `next` and totals, the inbox cap; unit tests of the paging helpers and the retry delay.

### 0.3.0 — 2026-11-06

Needs the backend's scale PR (#31):

- ETags: the API client keeps the last answer to each read in memory only (per person, at most 200 addresses), sends
  its ETag as `If-None-Match` and shows the kept data on a 304, so the day board and the bell, re-read every 30 to 60
  seconds, download nothing when nothing changed. Answers stay `no-store` (a shared phone keeps nothing after
  sign-out); the memory is forgotten on sign-out, when the session ends and when another person signs in. A 304 is
  never an error and never retried.
- A 304 for which nothing is kept (a cache or proxy on the way, or the person signed out or changed while the
  read was on its way) is asked once more without `If-None-Match` and past any cache, instead of becoming an error.
- Photo uploads answered 503 `PHOTOS_BUSY` show "Lots of photos are being sent right now. Try again in a minute."
  under the picker and are not sent again by themselves (only `SERVICE_BUSY` is a short blip worth repeating).
- Tests: the fake backend answers ETags and 304s like the real one; end-to-end tests for a 304 refresh and a busy
  photo upload; unit tests of the ETag memory and of PHOTOS_BUSY not being repeated.

### 0.2.1 — 2026-11-06

- Messages: "99+ unread" on the bell's spoken label and in the inbox once there are more than 99 (the backend now
  counts unread up to 100, so 100 means 100 or more). The fake backend caps the count the same way; an end-to-end
  test covers it.

### 0.2.0 — 2026-11-05

Uses the backend's salon fixes (backend PR "Salon gaps found by the partner app review"; merge that first):

- **Done early** on anything in the chair: the rest of the barber's time is free.
- A walk-in in the chair can be given to another barber (the rest of the visit, from now), or cancelled as a mistake
  in its first 15 minutes in a chair (counted from when it was put in one, so a move doesn't reset it), by the owner,
  a helper or whoever added it (who may also mark it done early).
- A barber's own column comes from the backend (`myStaffId`): a barber with walk-in access sees everyone but acts only
  on his own column, and "Add break" is always his own.
- A barber's own breaks: today or tomorrow, at most 4 hours a day, checked before sending; "Remove break" only on
  breaks he added (`addedByMe`) that haven't started.
- Start shows only from 15 minutes before to 15 after the booking's time ("Start opens at …"), and turns off on the
  code screen if that window closes while it is open; "Undo no-show" only within 24 hours.
- Queries and actions run even when the phone thinks it is offline, so the board says "offline" instead of waiting.
- Refusals use the backend's reasons ("someone changed it meanwhile: it is now …", "given to another barber",
  "busy until…").
- New messages in the inbox: a booking given to another barber, cancelled by the salon, a walk-in cancelled.

### 0.1.0 — 2026-11-05 (first version)

First version, for salons:

- Sign-in, email and name steps, and the session, copied from the customer app (own storage keys).
- Shop gate: start screen for people with no shop, kirana "coming soon", "not live yet" for staff, read-only day for
  a suspended salon.
- Registration in three steps: details with a GPS pin on a draggable map, owner and shop photos shrunk on the
  phone, check and submit; a sent-back draft shows the field team's reason.
- Today: a day board per barber with ‹ › days, the setup checklist, pause and resume, and an appointment sheet to
  start (with or without the code), mark and undo no-shows, give to another barber, cancel with a reason, and call
  late customers (owner and helper).
- Walk-ins, breaks and leave (with bookings in the way listed first), closed days.
- Bookings: coming up, and history with totals for owner and helper.
- Salon setup: services, barbers (services, weekly hours, sign-in, photo) and booking rules.
- Team: helpers and walk-in access. More: profile, notifications, help, sign out, leave the salon.
- Messages inbox for salon and shop news; push opens only this app's pages.
- Unit and end-to-end tests in CI, and the scenario list in `docs/scenarios.md`.
- After the independent reviews: start-code errors as the backend sends them (tries left, lock), field reasons
  spelled out, walk-in keys kept after a lost answer, a failed re-check keeps the screen, every tab forgets the
  previous person, cleared date fields can't crash a screen (plus an error boundary), shifts till midnight, the
  board, no-show time and pause banner move on by themselves, and the end-to-end job pinned to Ubuntu 24.04.
