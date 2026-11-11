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

v1 is for salons only. Someone whose shop is a kirana sees "Kirana partners: coming soon" and nothing else; no
kirana screen exists in this app. Customers use [apni-dukan-customer](https://github.com/Premanshu-jha/apni-dukan-customer);
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
| `VITE_SUPPORT_EMAIL` | Where partners write for help (More). Default `support@apnidukan.in` | `support@apnidukan.in` |
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
| Sign in, code, email, name | `/signin`, `/signin/code`, `/welcome/*` | Everyone (same as the customer app) |
| Start (no shop yet) | `/start` | New people |
| Register: details, photos, submit | `/register`, `/register/photos`, `/register/review` | Owner of a draft |
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
  B -- "404 NO_SHOP" --> C["Start: register, or ask the owner to add me"]
  B -- "type KIRANA" --> K["Kirana partners: coming soon"]
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
  O->>A: Submit
  A->>B: POST /shops/me/submit (version)
  B-->>A: PENDING_VISIT
  Note over A: Today shows "Waiting for our field team" and the shop code
```

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

## Changelog

### 0.11.1 — 2026-11-11

- The day's address searches used up now says "Try again tomorrow" (it said "Try again in 1437 minutes").
- The salon's pin can be moved with the keyboard: Tab to it, then the arrow keys (Shift: further).
- Scenarios 201 and 303 in `docs/scenarios.md`.

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
- Dependabot (npm and GitHub Actions, weekly) and `npm audit --audit-level=high` in CI.
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
