# Apni Dukan — partner app

The app salons use to run their day on Apni Dukan: register the salon, set up services and barbers, and work the
day's bookings and walk-ins. It is a phone-first web app (it can be added to the home screen) and talks only to
[apni-dukan-backend](https://github.com/Premanshu-jha/apni-dukan-backend).

One app for everyone in a salon, each seeing only their part:

| Role | How they get in | What they see |
| --- | --- | --- |
| Owner | Registers the salon here | Everything: setup, the day board, breaks and leave, closed days, pause, Team |
| Helper | The owner adds their number in Team | The day board and its actions, breaks, pause; setup to look at, not change |
| Barber | The owner gives him a sign-in on his barber page | His own bookings and his own breaks (everyone's day if the owner gave him walk-in access) |

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

CI runs type-check, lint, unit tests, build, the end-to-end tests and a gitleaks secret scan on every pull request.

### Tests

Every situation an owner, helper or barber can run into is listed in [`docs/scenarios.md`](docs/scenarios.md): the
journey, what the backend answers, what the screen shows, and which test proves it. New work adds or updates rows
there, and reviews walk the list against the code.

- **Unit tests** (`src/**/*.test.ts`): role rules, the token's shop, registration checks, rupees to paise, weekly
  hours, break and leave times in India time, pause ends, grouping by date, which message links may open, photo
  sizes, plus the copied API client, session and India-time tests.
- **End-to-end tests** (`e2e/`): Playwright on a phone-sized Chromium, against `e2e/mockApi.ts`, a fake backend whose
  answers follow the backend's records, rules and error codes (who may do what, versions, the start window,
  conflicts). `.env.e2e` points the app and the map tiles at it, so tests never reach the internet. Journeys:
  registration end to end, a sent-back draft, a blocked location, the gate for every shop state and role, starting
  with and without the code, no-show and undo, reassign, salon cancel, walk-ins (double tap, busy barber, no
  access), breaks with bookings in the way, leave, closed days, pause, setup with stale saves, Team, messages,
  leaving, sign-out, and an expired session in two tabs. A failed run in CI keeps its traces.

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
| More (profile, help, sign out, leave) | `/more` | Everyone |
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
  O->>A: Details and "Use my location" (GPS, drag the pin)
  A->>B: POST /shops (type SALON)
  B-->>A: 201 DRAFT
  A->>B: POST /auth/refresh (the new token carries the shop)
  O->>A: Owner photo, shop front (shrunk on the phone)
  A->>B: POST /files?purpose=OWNER_PHOTO, SHOP_PHOTO
  A->>B: PUT /shops/me/photos (version)
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
  C -- "No-show, from 15 min after the start (or automatic)" --> N["NO_SHOW"]
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

`GET /salon/day?date=` every 30 seconds, on focus and on push. A barber's own profile (for his breaks) is found by
matching his phone to the `loginPhone` of the barber list. Every action in the appointment sheet locks its buttons
while it runs and reloads the day afterwards, whatever the answer, because a refusal usually means someone else
(the customer, another staff member) changed it first.

Walk-ins carry an `Idempotency-Key`, one per walk-in: the same key on a retry gives back the same walk-in, and a
new key is made when the services or the barber change.

### Times

Every date and time is India time (`lib/ist.ts`), whatever zone the phone is set to. Leave covers whole India days:
the first day's 00:00 to the 00:00 after the last day.

### Notifications

The inbox asks for `app=partner` (salon and shop messages only). Push is per person, not per app, so someone who
is also a customer can get a customer message on this phone: the service worker opens only this app's pages
(`/salon/*`, and `/shops/*` as the start) and otherwise the board.

### Copied from the customer app

`src/api/client.ts`, `errors.ts`, `auth.ts`, `push.ts`, `src/store/session.ts`, `src/lib/{ist,money,phone,storage,device}.ts`,
`src/components/{ui,CodeInput,Turnstile}.tsx` and `src/features/auth/*` are copies of the customer app's, with
the storage keys renamed (`adp.*`) and the wording changed for partners. A fix in one should go to the other until
the admin app makes a shared package worth it.

## Deploying

Any static host works (Railway, Vercel or Cloudflare Pages). Build command `npm run build`, output folder `dist`,
and set `VITE_API_URL` (and `VITE_TURNSTILE_SITE_KEY` in production). All routes must serve `index.html`
(`public/_redirects` does this where supported). Then add the site's address to the backend's `CORS_ALLOWED_ORIGINS`.

Until the admin app exists, nobody can approve a salon: for a first real test, approve it by hand in the database
(set `shops.status` to `APPROVED`).

## Changelog

### 0.1.0 — 2026-11-05

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
