# Partner scenarios (kirana, round 1: registration and the counter)

Scope: everything a kirana owner or helper can run into in the partner app's round 1. That covers "What do you run?", registering as a kirana (and changing the kind by mistake), the counter, products and stock, the khata book, bills and the day's totals, the team, and the UPI ID. Each row is checked against the backend (`kirana` branch, README "The kirana counter" and "How shops work") and this app.

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
| 1.3 | Opens `/register` without having picked | — | Sent to "What do you run?" first | — | e2e:edges "an unsaved registration draft…" | OK-tested |
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
| 2.9 | After Submit | PENDING_VISIT | The counter opens, with "What happens next" (hidden for good with "Got it") and the shop code; the approval bar says the counter already works | ShopIT | e2e:kirana-register "a kirana owner answers…" | OK-tested |
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
| 7.5 | A salon's people at `/kirana/*`, a kirana's at salon paths | 409 NOT_A_KIRANA / NOT_A_SALON | Sent home; no call of the other kind is made | KIT, SalonIT | e2e:gate "a kirana's people see only kirana screens…" | OK-tested |

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
| I.21 | "What happens next" pushed the counter down on every bill | "Got it, hide this" |
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

