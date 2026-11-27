# Partner scenarios (kirana, round 1: registration and the counter)

Scope: everything a kirana owner or helper can run into in the partner app's round 1. That covers "What do you run?", registering as a kirana (and changing the kind by mistake), the counter, products and stock, the khata book, bills and the day's totals, the team, and the UPI ID. Each row is checked against the backend (`kirana` branch, README "The kirana counter" and "How shops work") and this app.

All of it needs the kirana switch on (`VITE_KIRANA_ENABLED=true`, and the backend's `KIRANA_ENABLED`); off (the default) the app is the salon app (`docs/scenarios.md` rows 3 and 4). These rows' e2e tests run in the Playwright `kirana` project.

How to read the columns:
- **API behaviour** comes from the backend's code.
- **App behaviour** comes from this app (`src/features/kirana/**`, `src/features/shop/KiranaRegister.tsx`, `src/api/kirana.ts`, `src/lib/kirana.ts`).
- **Backend tests:** `KIT` = KiranaIntegrationTest, `SIT` = ShopIntegrationTest.
- **App tests:** `unit:` is `src/lib/kirana.test.ts` (`unit-common:` is `src/features/kirana/common.test.tsx`); `e2e:` names a Playwright spec and its test.

Verdicts:
- **OK-tested**
- **OK-untested**
- **GAP**
- **N/A-v1**
- **INCONVENIENCE** (it works, but it gets in the way; the fix is given)

Rounds 2 (online orders, earnings and payouts) and 3 (stock from distributors' bills and scans) add their own rows.

## 1. "What do you run?" and the kind of shop

| # | Scenario | API behaviour | App behaviour | Backend test | App test | Verdict |
|---|---|---|---|---|---|---|
| 1.1 | A new owner on Start | `GET /shops/me` 404 NO_SHOP | "I own a shop" leads to `/register/kind`, which offers two big cards: Kirana / general store, Salon / barber shop | — | e2e:kirana-register "a kirana owner answers…" | OK-tested |
| 1.2 | Picks one before anything is saved | nothing is sent | The answer is kept on this phone, tagged with the person (`adp.registerKind`), and step 1 opens in that kind's words | — | same | OK-tested |
| 1.3 | Opens `/register` without having picked | — | Sent to "What do you run?" first | — | e2e:kirana-gate "with the switch on, Start says…" | OK-tested |
| 1.4 | Shared phone: the next person signs in | — | The kind and the typed draft are forgotten at sign-out, and the next person is asked again | — | same | OK-tested |
| 1.5 | Picked the wrong kind: changes it from any step before Submit | `PUT /shops/me/type` 200; photos and video stay, a trade licence is checked again for the new kind | Every step shows "Registering a … · Change". Changing asks first and says what stays and what goes; afterwards the owner lands on the first step the new kind still needs (a kirana: Licences) | SIT theOwnerChangesKiranaToSalon…, theVideoAndATradeLicenceStay… | e2e:kirana-register "picked salon by mistake…" | OK-tested |
| 1.6 | Changes back to a salon | 200; a Shops and Establishments certificate (a kirana's only) is removed, unless it is also the FSSAI certificate's file | The question says so; a UPI ID and food answer stay saved in case they change back | SIT theVideoAndATradeLicenceStay…, oneUploadUsedAsBoth… | e2e:kirana-register "picked salon by mistake…" (the question) | OK-tested (removal); OK-untested (the salon's steps after) |
| 1.7 | After Submit | 409 WRONG_STATUS | The review's question says the kind can't change after submitting; `/register/*` takes the owner home | SIT theTypeIsLocked… | e2e:kirana-register "a kirana owner answers…" | OK-tested |
| 1.8 | Sent back after an earlier approval (`addressLocked`) | 409 WRONG_STATUS | No "Change" link; an old link opened anyway shows the backend's reason | same | e2e:kirana-register "a shop approved once…" | OK-tested |
| 1.9 | Salon draft whose barber already signed in, or a barber invitation waiting | 409 HAS_BARBERS | The backend's words are shown on the question screen | SIT theTypeIsLocked… | — (mock answers it) | OK-untested (app) |
| 1.10 | Two phones change it at once | One gets 200, the other 409 SHOP_CHANGED | The shop is read again; the screen shows the reason | SIT theOwnerChangesKiranaToSalonAndBack… | — | OK-untested (app) |
| 1.12 | A kirana sent back after its visit, already billing (bills, products, khata, helpers), changes to a salon | 409 HAS_COUNTER_DATA: it stays a kirana | The backend's words on the kind screen | SIT aKiranaThatAlreadyWorksAtItsCounterStaysAKirana | e2e:kirana-register "a kirana that already billed stays a kirana" | OK-tested |
| 1.11 | Changed 10 times in a day | 429 TOO_MANY_REQUESTS | Says to try tomorrow or write to support | SIT theKindChangesAtMostTenTimesADay | — | OK-untested (app) |

## 2. Registering a kirana

| # | Scenario | API behaviour | App behaviour | Backend test | App test | Verdict |
|---|---|---|---|---|---|---|
| 2.1 | Step 1 in a shop's words | `POST /shops {…, type: KIRANA, gstin?}` | Fields read "Shop name", "Find my shop on the map" and "Shop location"; the steps are Details · Photos · Licences · UPI ID · Submit; the GSTIN hint no longer claims it is printed on bills | ShopIT | e2e:kirana-register "a kirana owner answers…" | OK-tested |
| 2.2 | Optional GSTIN, typed in lower case or with spaces | Stored in capitals; a typo gets 400 naming `gstin` | Sent cleaned; the error shows under the field | SIT textIsTidiedGstin… | same | OK-tested |
| 2.3 | GSTIN removed while editing | PATCH `gstin: ""` | Saved as no GSTIN | ShopIT | — | OK-untested |
| 2.4 | Photos and video step | Two photos and the shop video (15–45 s, as a salon's); Submit without it 409 PHOTOS_REQUIRED naming `shopVideoFileId` | "Shop video" card (shelves and counter); "Both photos and the shop video are needed"; Continue goes to Licences | SalonVideoIT aKiranaRecordsItsVideoToo… | same | OK-tested |
| 2.4a | "Do you sell any food items?" | `PUT /kirana/settings/sells-food`; unanswered: Submit 409 REGISTRATION_INCOMPLETE `sellsFood` | Two chips; Continue stays off with "Say whether you sell any food items." | KIT aKiranaNeedsItsUpiIdBeforeTheVisit… | e2e:kirana-register (all three licence tests) | OK-tested |
| 2.4b | Sells food: the FSSAI licence | `PUT /kirana/online/fssai` (14 digits, this shop's REG_DOC); NONE, REJECTED or expired: Submit 409 naming `fssai`; CHECKING is enough | The picker stays off until the 14 digits are typed (a photo taken first isn't thrown away); "Checking…" refreshes every 8 s while the AI reads it, every minute once a person does; Continue works once it is being checked | KIT aKiranaNeedsItsUpiIdBeforeTheVisit… | e2e:kirana-register "a kirana owner answers…" | OK-tested |
| 2.4c | FSSAI refused | REJECTED with the reason; the same certificate again goes to a person ("Our team is checking it, usually within a day.") | The reason; "Ask a person to check it", then the backend's words while a person checks; Continue and Submit stay off while refused | KIT (refused by SQL; the person path untested in the backend) | e2e:kirana-register "a kirana selling food can't submit…" | OK-tested (app) |
| 2.4c2 | Selling food with no FSSAI licence at all | Submit refused (the licence stays required: decided 2026-11-18) | "Don't have an FSSAI licence yet?" (also "How do I renew…" when it expired, and after a refusal): apply on foscos.fssai.gov.in, Basic Registration (Form A) ₹100 a year, usually a few days; the registration PDF is the certificate, not the receipt; what was saved stays (a typed number without a certificate isn't kept). The review shows "FSSAI: missing · Add", which leads there | — | e2e:kirana-register "selling food with no FSSAI licence yet…", "an expired FSSAI licence says where to renew it" | OK-tested |
| 2.4d | Sells no food | Nothing more needed | "No FSSAI needed. Our field team checks the shop at the visit." | KIT aKiranaSellingNoFood… | e2e:kirana-register "a kirana selling no food…" | OK-tested |
| 2.4e2 | Picked the wrong paper kind after uploading | The same file sent as the other type, checked again | Tapping the other chip re-sends it at once; Remove asks first | — | — | OK-untested |
| 2.4e | Optional trade licence or Shops and Establishments certificate | `PUT /shops/me/registration-document` (TRADE_LICENCE or SHOPS_ESTABLISHMENT for a kirana; UDYAM 400); checked by the AI (shop trade, not salon) | Chips for which paper; checking, passed (no end date shown as such), refused with the reason, check again, remove | SalonVisitsIT, LicenceCheckIT aKiranasShopsAndEstablishmentsCertificateWithNoEndDate…, LicenceRulesTest aKiranasDocument… | e2e:kirana-register "a kirana owner answers…" | OK-tested |
| 2.4f | Food answer changed after verification | 403 EDIT_LOCKED | The code sheet comes up; nothing changed | KIT | e2e:kirana-fixes "a verified kirana changes its papers only after the phone code" | OK-tested |
| 2.4g | Answered No, submitted, then switches to Yes | 409 FSSAI_REQUIRED without a licence that counts | The backend's words under the question | KIT aKiranaSellingNoFood… | e2e:kirana-fixes "after Submit, No food…" | OK-tested |
| 2.5 | UPI ID mistyped ("sharmastore") | 400 naming `upiId` | Checked on the phone first: "It looks like name@bank, e.g. …" | KIT aKiranaNeedsItsUpiId… | same | OK-tested |
| 2.6 | UPI ID with capitals or spaces | Stored cleaned | Shows "Saved as …" before saving | same | same | OK-tested |
| 2.7 | Review without the UPI ID | Submit gets 409 REGISTRATION_INCOMPLETE `upiId` | Submit is disabled; "UPI ID: missing" with Add; Add goes back to the review afterwards | KIT | e2e:kirana-register "a kirana missing its UPI ID…" | OK-tested |
| 2.8 | Coming back later | — | "/" goes to the first step not done (photos and video, licences, UPI ID), else the review | — | e2e:kirana-register "a kirana selling food can't submit…", "… missing its UPI ID…" | OK-tested |
| 2.9 | After Submit | PENDING_VISIT | The counter opens with the one-line setup strip above Scan ("Set up your products: photograph your list ›"), not "What happens next": that card comes only after "I've added all my products" (rows 9.1, 9.20); the approval bar says the visit is booked once the products are added and the counter works meanwhile | ShopIT | e2e:kirana-register "a kirana owner answers…" | OK-tested |
| 2.10 | Helper of a kirana waiting for the visit | 200 (KiranaAccess allows any status) | Bills at the counter, as the owner does (was: kept on a waiting screen) | — | e2e:kirana-fixes "a helper of a kirana waiting for the visit…" | OK-tested |

## 3. The counter

| # | Scenario | API behaviour | App behaviour | Backend test | App test | Verdict |
|---|---|---|---|---|---|---|
| 3.1 | A pack scanned | `GET /kirana/products/barcode/{code}` → product and pack | Added at once ("… added"); the same code seen again within 2 s counts once; a carton adds its pack; a full bill says so instead of "added" | KIT aProductHasSeveralBarcodes… | e2e:kirana-counter "a cash bill from scans…" (typed digits: the 2-second rule is untested) | OK-tested (pack); OK-untested (2 s) |
| 3.2 | No camera, or the camera refused | — | Says so; the digits can always be typed under the camera | — | — (the test browser has no camera; the messages are untested) | OK-untested |
| 3.3 | iPhone Safari (no BarcodeDetector) | — | ZXing is loaded only then and reads the video frames | — | — | OK-untested (needs a real iPhone) |
| 3.4 | A barcode not in the list | 404 PRODUCT_NOT_FOUND | Three choices: add a new product (it comes back onto the bill), link it to a product already there (with "Pieces in one scan"), or bill it without a product | KIT | e2e:kirana-counter "an unknown barcode…" | OK-tested |
| 3.5 | Search by name or barcode digits | `GET /kirana/products?q=` | Waits until typing stops (300 ms); up to 8 results; nothing found offers "Bill … without a product" and "Add it as a product" | KIT | e2e:kirana-counter | OK-tested |
| 3.6 | Loose item by weight or by ₹ ("₹30 of sugar") | `{productId, amountPaise}`; the weight is worked out to the gram | "By weight" or "By amount (₹)", with the weight it buys shown before adding | KIT aBillTakesLooseItems… | unit "a loose amount…"; e2e | OK-tested |
| 3.7 | Less than a gram | 400 | Refused on the phone with the backend's words | KIT | unit | OK-tested |
| 3.8 | Item not in the list whose name is in the list | 409 ITEM_IN_LIST | The backend's message (scan or pick it) | KIT | — | OK-untested (app) |
| 3.9 | − and + on pieces; Change on every line; Remove; Clear bill | — | Each line shows its quantity × price and amount; − at 1 removes the line; an item not in the list can have its name changed; Clear bill asks first; at most 100 lines, said when reached | — | e2e:kirana-fixes "a whole bill cleared…", "an item not in the list…"; unit "the bill keeps up…" | OK-tested |
| 3.9a | A price changed since the line was added | The bill is saved at today's price | Scanning or picking the product again brings its price and name; a receipt total different from the one shown says so | — | unit "the bill keeps up…" | OK-tested |
| 3.10 | Discount: owner up to the bill, helper up to ₹10 | 403 OWNER_ONLY past ₹10 for a helper | Checked on the phone with the reason; the discount shrinks with the bill | KIT | unit; e2e "a helper can take up to ₹10 off…" | OK-tested |
| 3.11 | Cash | 201 | "Bill N saved" with the total, running-out products, a link to the bill, and "Cash given" working out the change | KIT | e2e:kirana-fixes "the receipt…" | OK-tested |
| 3.12 | UPI | 201 with `upi` | QR drawn on the phone (qrcode, loaded on first use) with the amount, payee and UPI ID | KIT | e2e "a UPI bill shows the QR…" | OK-tested |
| 3.12a | UPI didn't go through, they pay cash | `…/payment` CASH | "UPI didn't work: paid by cash instead" on the receipt, one tap | KIT | e2e:kirana-fixes "the receipt…" | OK-tested |
| 3.13 | UPI with no UPI ID set | `upiIdMissing: true` | "No QR: the shop's UPI ID isn't set", with Set it now (owner) or ask the owner (helper) | KIT | same | OK-tested |
| 3.14 | Khata: pick a customer, or add one on the spot | 201; `khata` after it | The book is searched by name, flat or phone, each with what they owe and can still buy; "+ New khata customer" | KIT | e2e "khata: a new customer…" | OK-tested |
| 3.15 | Over the khata limit | 409 KHATA_LIMIT | The backend's words (what they can still buy) inside the khata sheet; the owner gets "Change …'s khata limit" | KIT khataSalesStayWithinTheLimit… | e2e:kirana-fixes "a khata over its limit…" | OK-tested |
| 3.16 | Part paid now (cash or UPI) | `paidNowPaise`/`paidNowBy` | "On khata ₹X" updates as it is typed; a QR for the part paid by UPI; paid in full is refused ("use Cash or UPI") | KIT | same | OK-tested |
| 3.17 | The answer never came (offline, 5xx; not 503 SERVICE_BUSY, which saved nothing) | The same clientRef returns the first bill (`repeated`) | The bill is locked and the khata sheet closes; only "Try again: <the same payment> ₹X" is offered; it survives a reload; "Add it as a product" is hidden; "Change this bill anyway" asks first and gets a new clientRef | KIT | e2e:kirana-counter "a Save whose answer never came…", e2e:kirana-fixes "Change this bill anyway…"; unit-common (outcomeUnknown) | OK-tested |
| 3.17a | The retry is refused for good (4xx) | The clientRef is looked up first, so a refusal means nothing was billed | The bill unlocks (same clientRef) so the refused part can be fixed | KIT | e2e:kirana-fixes "a retry refused for good…" | OK-tested |
| 3.18 | A product removed meanwhile | 409 PRODUCT_GONE `productIds` | Those lines are outlined, asking to take them off; the product list is read again | KIT | e2e:kirana-fixes "a retry refused for good…" | OK-tested |
| 3.19 | Reload, a call coming in, the app sent to the back | — | The bill being made stays on this phone (`adp.kiranaCart`, tagged with the person and the shop) | — | e2e "the bill being made stays…" | OK-tested |
| 3.20 | Shared phone | — | One cart per person and shop (`adp.kiranaCart.<user>:<shop>`): signing out forgets it, except an unsure one, which waits for that person's safe retry; the next person never sees or overwrites it | — | e2e:kirana-counter "the bill being made stays…" (forgotten at sign-out; a second person isn't signed in) | OK-tested (forget); OK-untested (second person) |
| 3.21 | Double tap on Cash | — | A ref holds the first tap; the clientRef also makes the backend bill once | KIT | e2e:kirana-fixes "a double tap on Cash bills once" | OK-tested |
| 3.23 | Loose product added from the counter (Add it as a product, sold by kg) | — | Back at the counter its weight-or-amount sheet opens | — | — | OK-untested |
| 3.24 | Two tabs of the app on one phone | Each bills with its own clientRef | Both write the same person's cart: the last change wins | — | — | N/A-v1 |
| 3.25 | Midnight: a lost answer retried after 12 | `repeated` gives yesterday's bill, on yesterday's totals | The receipt shows it as saved | KIT | — | OK-untested |
| 3.22 | Scanner library can't load (offline on first use) | — | The camera stops and typing the digits is offered | — | — | OK-untested |

## 4. Products and stock

| # | Scenario | API behaviour | App behaviour | Backend test | App test | Verdict |
|---|---|---|---|---|---|---|
| 4.1 | Add a product with barcode, pack, stock and alert | 201 | Opens on its page; from the counter it goes back there and onto the bill | KIT | e2e:kirana-book "products: add one…" | OK-tested |
| 4.2 | Name taken | 409 NAME_TAKEN `productId` (after the barcode check) | The message, "Open it", and with a barcode typed "Add barcode … to <that product>" | KIT | e2e:kirana-fixes "a new product whose name is taken…" | OK-tested |
| 4.2a | Leaving Add a product half typed | — | The typing is kept in this tab and comes back (a different barcode or name opened starts fresh); forgotten at sign-out | — | same | OK-tested |
| 4.6a | The owner's edit refused because it changed on another phone | 409 PRODUCT_CHANGED | The product is read again; the edit sheet, the typing and the message stay | KIT | — | OK-untested |
| 4.3 | Barcode taken | 409 BARCODE_TAKEN | The backend's words (which product has it) | KIT | — | OK-untested (app) |
| 4.4 | Came in, damaged, count | `POST …/stock` with clientRef; 409 PRODUCT_REMOVED | Sheet with the stock now; a lost answer keeps the same change (locked) even after closing the sheet, until saved or "It wasn't saved" | KIT | e2e:kirana-fixes "a stock count whose answer was lost…" | OK-tested |
| 4.5 | Below zero | Allowed | Shown in red: "sold more than the app knew of: count it" | KIT | — | OK-untested |
| 4.6 | Owner edits name, price, unit (before the first sale) or alert, or removes and restores | PATCH; 409 PRODUCT_SOLD / PRODUCT_CHANGED | Edit sheet (the unit error shows under it); Remove and Put it back | KIT | e2e | OK-tested |
| 4.7 | Helper on a product | 403 for owner changes | No Edit and no Remove; stock buttons and adding barcodes stay | KIT | e2e "a helper sees no Edit…" | OK-tested |
| 4.8 | Barcodes: add (scan or type, pack), owner removes | 409 TOO_MANY_BARCODES at 10 | "+ Add" hidden at 10 | KIT | — | OK-untested |
| 4.9 | Running out | `GET /products/running-out` | Its own tab | KIT | e2e | OK-tested |
| 4.10 | Long catalogue | 50 a page | "Show more" | KIT | — | OK-untested |

## 5. The khata book

| # | Scenario | API behaviour | App behaviour | Backend test | App test | Verdict |
|---|---|---|---|---|---|---|
| 5.1 | Who owes what | `GET /khata` with owed and advances totals | Totals at the top; Everyone or Only who owe; search by name, note or phone | KIT | e2e:kirana-book "khata: …" | OK-tested |
| 5.2 | They paid | 201 with clientRef | The amount is filled with what they owe; cash or UPI | KIT | same | OK-tested |
| 5.2a | The answer to a payment never came | The same clientRef records it once | The sheet keeps that payment (locked) even after it is closed and opened again; "It wasn't saved" lets it change | KIT | e2e:kirana-fixes "a khata payment whose answer was lost…"; unit | OK-tested |
| 5.3 | Paid more than owed | 409 MORE_THAN_OWED (`advancePaise` the extra, `advanceAfterPaise` the total), then `advance: true` | "That's ₹X more than … owes. Keep the extra as their advance? Their advance becomes ₹Y" | KIT moreThanOwedIsKept… | e2e:kirana-book "khata: …" | OK-tested |
| 5.4 | Payment recorded by mistake | `…/reverse` 201; helper only his own within 10 min | "Undo this payment" (owner always; a helper on his own within 10 minutes), with a reason; stays in the history marked undone | KIT | same | OK-tested |
| 5.5 | WhatsApp reminder | — (nothing is sent by Clozest) | A wa.me link with the amount in the message; without a phone "Add mobile for WhatsApp" opens the edit sheet | — | unit; e2e:kirana-fixes "the owner sets…" | OK-tested |
| 5.6 | Owner: limit or no limit (also when adding a customer), advance back, take out of the book | POST/PATCH (403 for a helper's limit), `advance-back` with clientRef, 409 STILL_OWES | The owner sets the limit when adding; a helper sends none; "Give back their advance" keeps a lost answer like a payment | KIT | e2e:kirana-fixes "the owner sets…", "a helper adding…" (advance back, STILL_OWES and changing a limit: untested in the app) | OK-tested (adding); OK-untested (the rest) |
| 5.7 | Phone taken by another customer | 409 PHONE_TAKEN `customerId` | The message, plus "Use the customer who has this number" (picked at once) | KIT | — | OK-untested (app) |
| 5.8 | "Keep it as advance" whose answer is lost or refused | — | The error shows on the question; a lost one goes back to the form locked on what was sent | KIT | — | OK-untested |

## 6. Bills and the day

| # | Scenario | API behaviour | App behaviour | Backend test | App test | Verdict |
|---|---|---|---|---|---|---|
| 6.1 | Bills list | 50 a page, newest first | Today's totals on top (tap for the day); each bill shows its number, time, items, total and how it was paid; cancelled ones marked | KIT | e2e:kirana-book "bills: …" | OK-tested |
| 6.2 | Cancel with a reason | `…/void` | Quick reasons (Billed twice, Customer left…) or typed; says what goes back (stock, khata, money to hand back) | KIT | e2e:kirana-book "bills: …" (typed reason; the chips and the "what goes back" text are untested) | OK-tested |
| 6.2a | The UPI QR closed too early | The same payment again answers with its QR, changing nothing | "Show the UPI QR again" on a UPI bill | KIT | e2e:kirana-fixes "a UPI bill shows its QR again…" | OK-tested |
| 6.3 | Items brought back | `…/returns` with clientRef; the refund is the line's share after the discount | Per line, up to what's left, with "All"; says how the refund goes back; a lost answer keeps the same return | KIT | e2e:kirana-fixes "a bill with items brought back…" | OK-tested |
| 6.4 | Change how it was paid (UPI failed, put on khata, other customer) | `…/payment`; 409 KHATA_ALREADY_PAID, KHATA_LIMIT, BILL_CHANGED (the bill is read again), BILL_HAS_RETURNS | Chips Cash/UPI/Khata, customer picker, paid now; a QR when it became UPI; KHATA_ALREADY_PAID asks to keep the advance; hidden once items came back, saying why | KIT | e2e:kirana-fixes (receipt, returns) | OK-tested |
| 6.5 | Helper past his 10 minutes, or on someone else's bill (even one with the same name) | 403 OWNER_ONLY | No buttons; says only the owner can now; "his own" is by who made it (`byId`), not the name | KIT | e2e:kirana-book "bills: … helper past 10 minutes", e2e:kirana-fixes "a helper sees no changes on another helper's bill…" | OK-tested |
| 6.6 | The day's totals, earlier days | `GET /day?date=` | The drawer (cash in, UPI in) first, then sales, payment changes, khata received, returns and cancellations; ‹ › and a full-size date picker | KIT | e2e:kirana-book "the day: …" (screen and navigation; the figures are the backend's, not asserted) | OK-tested (screen); OK-untested (figures) |

## 7. Team, UPI ID and More

| # | Scenario | API behaviour | App behaviour | Backend test | App test | Verdict |
|---|---|---|---|---|---|---|
| 7.1 | Owner invites a helper | `POST /shops/me/helpers` 202 | "Invitation sent", shown under Invitations waiting with Cancel | ShopIT | e2e:kirana-book "the owner invites a helper…" | OK-tested |
| 7.1a | Telling the helper | — | "Tell them on WhatsApp" on each invitation waiting, with the app's link and the number to sign in with | — | — | OK-untested |
| 7.2 | Owner removes a helper | DELETE 200 | Asks first; the helper is signed out of the shop at once; a refusal shows inside the question | ShopIT | e2e:kirana-book "the owner invites a helper…" (the name goes; signing out and the refusal untested) | OK-tested (removal) |
| 7.3 | More for a kirana | — | Team, Day's totals, UPI ID, Licences (owner); "Photos and video"; no subscription or salon links | — | e2e:gate (helper's More) | OK-tested |
| 7.4 | Verified shop changes its UPI ID | 403 EDIT_LOCKED without the code | The UPI ID page is inside EditGate (the phone code first) | KIT aVerifiedKiranasUpiId… | — | OK-untested (app) |
| 7.5 | A salon's people at `/kirana/*`, a kirana's at salon paths | 409 NOT_A_KIRANA / NOT_A_SALON | Sent home; no call of the other kind is made | KIT, SalonIT | e2e:kirana-gate "a kirana's people see only kirana screens…" | OK-tested |

## 8. Languages on the kirana screens

App tests here: `unit-errors:` is `src/api/kiranaErrors.test.ts`, `unit-bills:` `src/features/kirana/Bills.test.tsx`, `unit-scanner:` `src/features/kirana/Scanner.test.tsx`, `unit-fssai:` `src/features/shop/fssaiReason.test.ts`.

| # | Scenario | API behaviour | App behaviour | Backend test | App test | Verdict |
|---|---|---|---|---|---|---|
| 8.1 | A kirana owner or helper who reads Hindi (or te/mr/ta/kn) | — | The counter, bills and the day, products and stock, the khata, the scanner, kirana registration, Licences and the UPI ID in the language; English is unchanged | — | i18n.test (every key in every language, same blanks) | OK-tested |
| 8.2 | A kirana error whose exact English message the app has | Code + English message | `server.json`'s words for that message, in every language (the most precise: one code can have several messages) | — | unit-errors "show the exact message first, then the code's words…" | OK-tested |
| 8.3 | A kirana error built with names or amounts (not in `server.json`), app in Hindi | e.g. 409 `KHATA_LIMIT` with `availablePaise`, `limitPaise` | `error.json`'s words for the code, blanks filled from `details` (paise shown as rupees: `{available}` "₹250.50") | — | unit-errors "show the exact message first…", "fills each code's blanks from what its errors carry…" | OK-tested |
| 8.4 | The same error, app in English | — | The backend's own sentence (it may name the customer or product): never the code's shorter words | — | unit-errors "shows the backend's own words in English…" | OK-tested |
| 8.5 | A code not in `error.json` and a message not in `server.json` | — | The backend's English as sent | — | unit-errors | OK-tested |
| 8.6 | A language missing one of the kirana codes | — | CI fails (every language has every code, with the same blanks) | — | unit-errors; i18n.test | OK-tested |
| 8.7 | Cancelling a bill or items brought back with a quick reason, app in Telugu | `…/void {reason}`, `…/returns {reason}`: saved as sent | The chip is saved in English ("Damaged"); shown in each person's language on the bill, so the owner in Hindi reads it in Hindi | — | unit-bills "saves a tapped reason in English, whatever the language…", "shows a saved reason in the person's language…"; e2e:kirana-fixes "items brought back with a tapped reason: saved in English, shown on the bill" | OK-tested |
| 8.8 | A typed reason (or a chip tapped, then words typed) | Saved as sent | Saved and shown as typed, in whatever language it was typed | — | unit-bills "keeps typed words as typed…" | OK-tested |
| 8.9 | Pieces and weights on the counter and bills | — | Pieces counted the language's way ("1 పీస్", "3 పీస్‌లు"); "kg", "₹" and digits 0-9 as on packs; numbers never grouped (1200) | — | unit "counts pieces in the app's language"; i18n.test | OK-tested |
| 8.10 | Quantity or amount typed wrong | — | "Enter a whole number", "At most 3 decimals (grams)"… in the language | — | unit (parseQty, parseRupees) | OK-untested (other languages) |
| 8.11 | The FSSAI check's reason (refused, being checked, an earlier licence still good until a date) | `fssai.reason` in English | Shown in the person's language, the date and number kept; an unknown reason as the backend wrote it | — | unit-fssai "stays as the backend wrote it in English", "is in the person's language…" | OK-tested |
| 8.12 | WhatsApp khata reminder from an owner using Telugu | — | The message is written in the app's language (the owner sees it before pressing send in WhatsApp) | — | — | OK-untested |
| 8.13 | The scanner's barcode reader doesn't download (offline on first use) | — | "The scanner couldn't load" in the language, typing the digits still works (not "no camera") | — | unit-scanner "says the scanner couldn't load…", "still says the camera can't be used…" | OK-tested |
| 8.14 | Push and inbox messages for a kirana, and kirana messages the backend builds with names | English | English on this branch | — | — | N/A-v1 (the backend writes salon and shared messages per language from V83 on `main`; kirana messages aren't texts yet) |

## 9. Product setup after Submit, and guidance (round "Kirana: product setup and guidance")

The backend books a kirana's first field visit only after `POST /kirana/setup/finish` ("I've added all my products"); until then it is in no agent's list (`ShopAssignmentStore.SET_UP`, `Shop.visitBookable`) and approving it is 409 `PRODUCTS_NOT_READY`. The app now has that whole journey. App tests: `unit-setup:` is `src/features/kirana/setupSteps.test.ts`, `unit-guides:` `src/features/kirana/Guides.test.tsx`, `unit-later:` `src/features/kirana/later.test.ts`; `e2e:setup` is `e2e/kirana-setup.spec.ts`. Backend tests: `PST` = the backend's product setup integration tests.

| # | Scenario | API behaviour | App behaviour | Backend test | App test | Verdict |
|---|---|---|---|---|---|---|
| 9.1 | Owner just submitted, no products | `GET /setup` `nextStep: ADD` | One line above Scan, "Set up your products: photograph your list ›" (Scan stays on the first screen of a 360 px phone, the strip under 60 px tall); the full card with progress, "Photograph your product list" and "Or add products one by one" is the setup's page; no promise of a call yet (F-01) | PST | e2e:setup "a new kirana: the counter says what to do…" (asserts no call text, Scan in view, strip height); e2e:kirana-register "a kirana owner answers…" | OK-tested |
| 9.2 | A page of the list photographed | `POST /files?purpose=BILL`, `POST /reads {clientRef, kind: STOCK_LIST, fileIds}` 201 READING | Good/bad drawings first; "Page sent… about a minute"; "Photograph the next page" | PST | e2e:setup same | OK-tested |
| 9.3 | The page is being read | `pagesReading > 0` | "Reading 1 page of your list…" + Check again; on the setup's screens `GET /setup` every 8 s for 2 min, then every minute to 10 min, every 5 min to 30 min, then stops (Check again); the counter's strip reads it once and never polls | PST | e2e:setup same; e2e:setup-review "AB#2: the counter reads the setup once…"; unit-setup "backs off…" | OK-tested |
| 9.4 | Lines one at a time | `GET /setup/lines` (20), `POST /setup/lines/{id} ADD/SKIP` | "Line 1 of 3", "2 left", a bar; the sure match picked; name, kg/piece and MRP as read for a new one; count chips "12 (as on the list)" / "0 (none now)" | PST | e2e:setup same | OK-tested |
| 9.5 | Add tapped with no count | 400 `quantity` (never sent) | "Count them now. 0 if there are none." under the field | PST | e2e:setup same | OK-tested |
| 9.6 | A double tap on Add | Sent once (a guard); sent again anyway: "the line as it is" | One product, counted once | PST | e2e:setup same (one POST) | OK-tested |
| 9.7 | App closed or reloaded mid-line; another phone | Lines saved as decided | The same next line; what was typed for it kept in the tab | PST | e2e:setup same (reload) | OK-tested |
| 9.8 | A heading skipped, then brought back | `SKIP`, `UNDO` | "1 line skipped: see it" → Bring back → "Check the line you brought back" | PST | e2e:setup same | OK-tested |
| 9.9 | A second line onto a product already counted | 409 `ALREADY_COUNTED {name, stock}` | Sheet "… is already counted": "Yes, add it (makes 10)" / "No, the count is 6" (`addToCount`) | PST | e2e:setup "a line onto a product already counted…" | OK-tested |
| 9.10 | A new product named like one the shop has | 409 `NAME_TAKEN {productId, name}` | The reason and "Use “…”, which you already have" (one tap) | PST | e2e:setup same | OK-tested |
| 9.11 | A line whose page was deleted on another phone | 404 `LINE_NOT_FOUND` | "That line isn't there any more… Here's the next one." | PST | — | OK-untested |
| 9.12 | A page that couldn't be read | `status FAILED`, `failureCode` | Why in plain words (each code in six languages), "Take it again" (the new page sent, the failed one discarded), "Delete page" after a question; the card says "Take 2 pages again" even with no products yet (`nextStep ADD`) | PST | e2e:setup "a page that couldn't be read…"; unit-setup | OK-tested |
| 9.13 | Sending a page, the answer lost | 201 the first upload again for the same clientRef | "We couldn't tell if it was sent… Try again: it won't be sent twice"; Try again sends the same file id and clientRef (no new upload) | PST | e2e:setup "a page sent with no answer…" | OK-tested |
| 9.14 | 60 pages kept / 100 sent today | 409 `TOO_MANY_PAGES` (failed, deleted and recount pages not counted) / `TOO_MANY_PAGES_TODAY` (every page sent today) | The reason with Write to us, "Or add products one by one", Call us / WhatsApp us | PST | e2e:setup-review "limits the backend has…" (TOO_MANY_PAGES_TODAY) | OK-tested (TOO_MANY_PAGES untested) |
| 9.15 | Products without a count | `nextStep COUNT`, `uncountedProducts` (20) | "Continue setting up · 1 left ›" → one at a time, by the product's own unit (Save waits until it is read), `POST /products/{id}/stock COUNT` with a clientRef per product and count, kept until answered; the next 20 read once these are done, once per state (never a loop: none listed again shows "may have been counted on another phone" + Check again) | PST | e2e:setup "counts, photos…"; e2e:setup-review "AB#7/CD#5…" | OK-tested |
| 9.16 | Products without a picture | `GET /setup/photos`, `PUT /products/{id}/photo` | One at a time: "Make sure “1 l” can be read" (`sizeToShow`), a loose one "in its sack or bin"; pack/loose drawings; "Skip for now" | PST | e2e:setup same | OK-tested |
| 9.17 | Photo refused / the size not on the front | `REFUSED` + code, `NEED_SIZE` | The refusal in plain words with "Take the photo again"; after NEED_SIZE "Now a photo of the side…", sent alone (`sizeFileId`, `fileId: null`) | PST | e2e:setup same; unit-setup "codes in plain words" | OK-tested |
| 9.18 | Photos being checked, or pictures still being found (GS1) | `nextStep WAIT`, `photosChecking`, `photosFinding` | "2 photos are being checked. Come back in a few minutes." + Check again, and "Photograph them anyway" while pictures are being found; polling backs off as in 9.3 and stops after 30 min | PST | unit-setup "polling", "backs off…"; e2e:setup-review "pictures still being found…" | OK-tested |
| 9.19 | 300 photos sent today | 409 `TOO_MANY_PHOTOS_TODAY` | The reason, and back to setup (no more tries that day) | PST | — | OK-untested |
| 9.20 | Owner taps "I've added all my products" | `POST /setup/finish` 200 `readyAt`; visit booked | Asked once more ("our field team calls you to fix a time"); then "All products added"; the counter shows "What happens next" (hideable) | PST | e2e:setup "counts, photos…" | OK-tested |
| 9.21 | Finish refused (changed on another phone) | 409 `PHOTOS_NEEDED` / `LINES_TO_CHECK` / `PAGES_FAILED` / `PRODUCTS_NOT_COUNTED` / `NO_PRODUCTS` | The reason stays on screen; the card reads the setup again and its button is the fix ("Take product photos: 1 left") | PST | e2e:setup "refused (a photo still missing)…" | OK-tested |
| 9.22 | Finish tapped twice / answer lost | "Said again: as it is" | A guard sends one; a lost answer says "Tap again: it's safe" | PST | — | OK-untested |
| 9.23 | A helper | `youCanFinish false`; finish 403 `OWNER_ONLY` | Does every step; at FINISH "Ask the owner to tap…" + "Ask the owner on WhatsApp" (message typed in) | PST | e2e:setup "a helper does the setup too…" | OK-tested |
| 9.24 | Products added after finishing, before approval | `beforeApproval`, `nextStep COUNT/PHOTOS/WAIT` | "Finish your new products": "Your visit is booked. Products added since need their count and photo…" | PST | unit-setup "finishing is the owner's…" | OK-tested |
| 9.25 | An approved kirana | — | No setup card and no `/setup` call (the counter is the hot path) | — | e2e:setup "an approved kirana never reads the setup…" | OK-tested |
| 9.26 | Every new text | — | In all six languages (en, hi, te, mr, ta, kn), simple words; native-speaker check pending | — | i18n.test; unit-guides | OK-tested |
| 9.27 | A refetch of the lines brings nothing though the setup said more (another phone checked them, a page deleted) | `GET /setup/lines` `[]` | One read of the lines per state of what is known, then the setup read once: "All lines checked", or "may have been checked on another phone" + Check again; never a spinner loop (AB#1, CD#3) | PST | e2e:setup-review "AB#1/CD#3…" (≤ 2 line reads) | OK-tested |
| 9.28 | A count whose answer was lost, then corrected | the same clientRef returns the first count | A clientRef per product and count: the corrected number is a new count and is applied; an answer not matching what was typed is said ("It shows 12 now…"), never passed off (AB#4, CD#2) | PST | e2e:setup-review "AB#4/CD#2…" | OK-tested |
| 9.29 | A line added with no answer, then sent with another count | "the line as it is" (its first `counted`) | "This line was already added with 12 (…). To change it, open the product and count it there." | PST | e2e:setup-review "AB#4: a line added…" | OK-tested |
| 9.30 | A list line matched to the shop's product sold by kg (or by piece) | `countFor` checks the product's unit; 400 `quantity` "must be a whole number…" | The count is checked by the product's own unit (read once), the label too; a catalogue item's unit isn't in the answer, so parts are allowed and the backend's answer names the count (AB#7, CD#5) | PST | e2e:setup-review "AB#7/CD#5…" | OK-tested |
| 9.31 | The same photo picked twice for the list | the upload `duplicate: true`, same file | "You've sent this photo already (page 1)": not sent as a second page (CD#10) | — | e2e:setup-review "CD#10…" | OK-tested |
| 9.32 | A recount page that couldn't be read, taken again | `POST /reads {recount: true}` | Sent as a recount, so its counts are still taken and it doesn't use one of the 60 pages (CD#11) | PST | e2e:setup-review "CD#11…" | OK-tested |
| 9.33 | A page sent with no answer, then a new photo picked | — | Only Try again (same file and clientRef) until settled; "Send a different photo instead" drops it on purpose (AB#10) | — | e2e:setup-review "CD#11… AB#10…" | OK-tested |
| 9.34 | Back while a product photo is being sent | — | Asked first, as on the list's page (EF#14) | — | e2e:setup-review "EF#14…" | OK-tested |
| 9.35 | A failed send on any setup step, the counter, registration or licences | 4xx/5xx | The shared ErrorBanner: the red line and "Still not working? Write to us"; an answer that never came in amber with "safe to try again" (EF#3) | — | e2e:setup-review "EF#3…" (finish, pages limit) | OK-tested (others by reading) |
| 9.36 | The setup can't be read on the counter | 5xx | "We couldn't check your product setup just now." + Try again + Call us / WhatsApp us | — | e2e:setup-review "…the setup's error state has Call us" | OK-tested |
| 9.37 | "I've added all my products" refused for pages that couldn't be read | 409 `PAGES_FAILED` | The fix goes to the first such page's retake, not the setup page itself (CD#12) | PST | e2e:setup-review "EF#3… CD#12…" | OK-tested |
| 9.38 | Shared phone: signing out mid-setup | — | The setup's typing, its sends waiting for an answer and a khata bill waiting are forgotten (AB#8; the bill and product typing already were) | — | unit review "signing out…" | OK-tested |
| 9.39 | A registration guide's download fails on a weak network | — | The guide is left out; the photos and video step works (EF#15) | — | e2e:setup-review "EF#15…" | OK-tested |
| 9.40 | "Save and add the next" after opening Add a product with a barcode | — | The used barcode leaves the address; a reload doesn't fill it again (CD#13) | — | e2e:setup-review "CD#13…" | OK-tested |
| 9.41 | A kirana helper sent away from an owner-only screen (/kirana/team, /kirana/upi, /kirana/licences) | — | The counter says why, once ("Only the owner can open that screen. Ask …") (AB#3, EF#2) | — | e2e:setup-review "AB#3/EF#2…" | OK-tested |
| 9.42 | A kirana message whose screen isn't on the message list (`/kirana/licences`, `/register/licences`, `/kirana/online`, `/kirana/shop-orders/…`) | — | Opens the counter with the message's note (9.41's note); the screens themselves need `MESSAGE_SCREENS` and `sw.js` (shared, salon engineer) | — | — | GAP (shared files) |
| 9.43 | Help on a kirana form sheet with typing (new khata customer, edit product, discount…) | — | The sheet's Help leaves without asking (shared `Sheet` default, AB#5) | — | — | GAP (shared files) |
| 9.44 | Help from the setup's screens | — | No help subject for /kirana/setup yet (EF#4: `help/links.ts`, shared) | — | — | GAP (shared files) |

### Many at once (setup)

| # | Scenario | Behaviour | Verdict |
|---|---|---|---|
| M.6 | 400 lines to check | 20 a page; the first page read again only when these 20 are decided (decided ones leave it), never in a loop; progress kept in the cache from each answer, not re-read per line | OK-tested (e2e:setup "twenty lines at a time…": 2 reads for 22 lines) |
| M.7 | Nothing on its way; something stuck on its way | The setup is read once; polling only on the setup's screens while a page reads (8 s) or photos are checked (20 s), backing off to 1 min and 5 min and stopping after 30 min (the AI down keeps a photo "checking" for hours), never on the counter or in the background | OK-tested (e2e:setup "nothing on its way…"; e2e:setup-review "AB#2…"; unit-setup "backs off…") |
| M.8 | Owner and helper deciding lines on two phones | Each decision under the backend's setup lock; a line already decided elsewhere is "the line as it is" (ADD) or 409 `LINE_ADDED` (SKIP): the app moves on | OK-untested |
| M.9 | Retries of pages, photos, counts | Each with a clientRef kept in the tab until answered (`onceRef`): sent once | OK-tested (unit-setup "sending once"; e2e:setup 9.13) |
| M.10 | Products changed by the setup | The catalogue query marked stale without refetching (`refetchType: 'none'`): read when next shown | OK-untested |

## 10. Other kirana fixes of this round (audit `partner-kirana.md`)

| # | Finding | Fix | App test | Verdict |
|---|---|---|---|---|
| 10.1 | F-01 texts promised a call that never came | Review, Submit sheet and approval bar say: add every product, tap "I've added all my products", then we call | e2e:kirana-register | OK-tested |
| 10.2 | F-06 Add a product threw you off after Save | From Products or the setup: stays, "Saved: … Add the next one." + Open it, Sold by kept, cursor in Name; from the setup the count is asked | e2e:setup "F-06/F-21…"; e2e:kirana-book | OK-tested |
| 10.3 | F-07 camera refused: no way to retry; no aim hint | "Try the camera again"; "Hold the barcode inside the box, 10–15 cm away…" | unit-scanner "with the camera refused…" | OK-tested |
| 10.4 | F-08 no good/bad pictures | Drawings before the face photo, shop front, video (kirana only), FSSAI, shop licence, list pages and packs; "Upload the certificate itself, not the receipt" out of the closed box | e2e:setup "F-09… F-08…"; unit-guides | OK-tested |
| 10.5 | F-09 greyed Submit with one plain sentence | Every gap listed, each a link to its step; on Licences the gap button scrolls to (and focuses) the question/number | e2e:setup "F-09…" | OK-tested |
| 10.6 | F-10 khata limit: Back lost the bill | Customer's Back goes to the counter ("← Back to the bill"); the khata sheet opens again with the same customer (read again) and paid-now | e2e:setup "F-10…" | OK-tested |
| 10.7 | F-11 unknown barcode took you to a long form | "Bill it now, add the product later" first (barcode kept per shop on this phone, listed on Products); "Add a new product" is a short form inside the scanner | e2e:setup "F-11…"; e2e:kirana-counter; unit-later | OK-tested |
| 10.8 | F-12 remove product/barcode on one tap | A question first | e2e:setup "F-12…"; e2e:kirana-book | OK-tested |
| 10.9 | F-13 helper refused: dead end | "Ask the owner on WhatsApp" with the message typed, naming the Clozest Partner app (product, bill, discount, UPI ID, khata limit; setup finish); a plain link in the Play Store app, a new tab on the website | e2e:setup "F-13…" (product page), "a helper does the setup too…" (finish); unit review "Ask the owner…" (app / website); bill, discount, UPI ID and khata limit untested | OK-tested (product, finish) / OK-untested (bill, discount, UPI ID, khata limit) |
| 10.10 | F-15 Day's Back went to Bills from More | Back goes where it was opened from; opened directly: Bills | e2e:setup "F-15…" | OK-tested |
| 10.11 | F-16 waiting card hidden for good | Replaced by the setup card (not hideable until finished) | e2e:setup 9.1, 9.20 | OK-tested |
| 10.12 | F-18 Today card error had no retry | Try again | e2e:setup "F-18…" | OK-tested |
| 10.13 | F-20 helper had no first-time hint | Card once per helper and shop: what he may do, what is the owner's | e2e:setup "a helper does the setup too…" | OK-tested |
| 10.14 | F-21 New product: no leave warning | Asked on Back while typed | e2e:setup "F-06/F-21…" | OK-tested |
| 10.15 | F-22 typing hidden below the camera | "Type the digits instead" above the camera (scrolls and focuses) | — | OK-untested |
| 10.16 | F-23 Day reached by a small line | Full-width "See today's cash and UPI →" | e2e:setup "F-15…" | OK-tested |
| 10.17 | F-02 empty Products had no button | "Add your first product" and, while setting up, "Photograph your product list" | — | OK-untested |

### Inconveniences left (need a decision or another engineer)

| # | What gets in the way | Fix | Verdict |
|---|---|---|---|
| I.30 | F-14: Bills can't be searched or opened by date | Needs `q`/`date` on the backend's `GET /kirana/bills` | INCONVENIENCE (backend first) |
| I.31 | F-17: abstract tab icons | Drawn icons through the svg-icon process (approval + blind test) in `Shell.tsx` | INCONVENIENCE (owner's decision) |
| I.32 | F-03/F-04/F-05/F-19: no Help on kirana screens, help card low on More, crash wording | On this branch (the salon engineer's shared help commits): Help and its error link show on kirana screens, the crash screen says shop. Still open there: kirana "How do I…?" answers (EF#7), a help subject for /kirana/setup (EF#4), sheet Help asking before losing typing (AB#5) | INCONVENIENCE (shared files, salon engineer) |
| I.33 | A helper's WhatsApp to the owner has no number filled in | Decided by the owner: helpers don't get the owner's number; WhatsApp asks whom to send to | DECIDED (no change) |
| I.34 | "Bill now, add later" barcodes live on this phone only | A backend list (like `/scans/unknown`) for counter scans | INCONVENIENCE (backend first) |
| I.35 | The photos step of registration still names only the first gap under Continue | The review lists every gap with links; the photos step is shared salon code | INCONVENIENCE (left: shared file) |

## Many at once

| # | Scenario | Behaviour | Verdict |
|---|---|---|---|
| M.1 | Typing in a search box | One request per pause (300 ms debounce); TanStack Query caches each search for 30 s | OK-untested |
| M.2 | Many bills in a minute | One request per bill; after a save, the kirana queries are marked stale (refetched only when shown) | OK-untested |
| M.3 | Scanner | Reads at most 5 frames a second; the same code within 2 s counts once; ZXing reads a 640 px copy | OK-untested |
| M.4 | Two helpers billing together | The backend saves a shop's bills one after another (settings row lock); each phone has its own cart and clientRef | OK-tested (backend KIT) |
| M.5 | The app comes back to the front | `refetchOnWindowFocus` reads what is on screen again; the only polling is the FSSAI status (every 8 s while the AI reads it, every minute once a person checks) and the shop licence's check, each only while its screen shows | OK-untested |

## Inconveniences found and fixed in this round

| # | What got in the way | Fix |
|---|---|---|
| I.1 | A salon picked by mistake could not be changed (the type was set for good at step 1) | Backend PR "change kirana ↔ salon while registering"; "Change" on every step |
| I.2 | Start said "salon" to a kirana owner | "I own a shop", then "What do you run?" |
| I.3 | A khata payment, return or stock change whose answer was lost was sent again as a new one after the sheet was reopened | Kept per form in the tab until settled (`useUnsureSend`) |
| I.4 | A failed UPI meant finding the bill to change it | "Paid by cash instead" on the receipt |
| I.5 | Working out change by hand | "Cash given" on the receipt |
| I.6 | No way to empty a bill except removing each line | Clear bill |
| I.7 | Linking a barcode always added 1 piece, even for a carton | "Pieces in one scan" when linking |
| I.8 | Add a product lost its typing on Back; a taken name was a dead end | Draft kept; "Add barcode … to …" |
| I.9 | Over the khata limit, the owner had to go find the customer | A link to change the limit |
| I.10 | A new customer's limit could only be set afterwards | The owner sets it when adding |
| I.11 | "No mobile for WhatsApp" was a dead, disabled button | "Add mobile for WhatsApp" |
| I.12 | Helpers couldn't bill until the visit, though the owner could | Helpers bill from Submit |
| I.13 | Typing a cancel reason each time | Quick reasons |
| I.14 | "Shown on your bills" for the GSTIN, though bills don't show it | Removed |
| I.15 | A barcode the shop hadn't linked stopped the bill | Three choices on the spot; a new product comes back onto the bill |
| I.16 | After the UPI ID step from the review, Save went on to the next step | "Save and go back to the review" |
| I.17 | The UPI QR couldn't be shown again after the receipt closed | "Show the UPI QR again" on the bill |
| I.18 | A loose product added from the counter didn't come onto the bill | Its weight-or-amount sheet opens |
| I.19 | The FSSAI photo could be taken before the number and was then thrown away | The picker waits for the number |
| I.20 | The shop paper's kind couldn't be changed after uploading; Remove had no question | The chip re-sends it; Remove asks |
| I.21 | "What happens next" pushed the counter down on every bill | "Got it, hide this" (after finishing); during the setup a one-line strip that can't be hidden but never pushes Scan below the fold (row 9.1) |
| I.22 | Helpers weren't told how to join | "Tell them on WhatsApp" |
| I.23 | A khata number already in the book was a dead end | "Use the customer who has this number" |
| I.24 | Helpers weren't told why a product has no Edit | "Only the owner changes the name, price or alert." |
| I.25 | The day picker was a tiny date | Full-size |
| I.26 | Salon words on a kirana's video and edit screens | The shop's words, naming the paper it has |
| I.27 | The kirana screens were English only after main's languages came in | All six languages (section 8) |
| I.28 | A code's short words were shown before the backend's own sentence, so English lost the customer's or product's name | The exact message first; the code's words (details filled in, paise as rupees) only outside English |
| I.29 | No barcode reader (offline on first use) said "the camera can't be used" | "The scanner couldn't load", typing still works |

### Left for later (features, not fixes; listed in the project's future plans)

- Send the bill to the customer on WhatsApp; hold a bill while serving the next customer; search and filters in Bills;
  a Scan button and a "stock came in" scanning mode in Products.

