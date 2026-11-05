# Partner scenarios (salon)

Scope: every scenario a salon owner, helper or barber can hit in the partner app, checked against the backend `apni-dukan-backend` (`main`: auth, shops, files, salon, notifications) and this app (`src/features/**`, `src/api/**`).
"API behaviour" comes from the backend's code; "App behaviour" from this app's code. Backend tests are JUnit methods: `AuthIntegrationTest` = AuthIT, `ShopIntegrationTest` = ShopIT, `FilesIntegrationTest` = FilesIT, `SalonIntegrationTest` = SalonIT, `SalonBookingIntegrationTest` = BookIT. App tests are Vitest (`unit:<describe>`) and Playwright (`e2e:<spec> "<title>"`).
Verdicts: **OK-tested**, **OK-untested** (correct but no test), **GAP** (wrong or missing; file:line given), **N/A-v1** (a v1 limit the README states).

Sign-in, the email and name steps, recovery and the session (refresh, several tabs, sign-out) are the same code as the customer app, copied unchanged; their rows are rows 1–30 and 120–146 of the customer app's `docs/scenarios.md`. Only what differs here is listed.

How to use it: every new feature or fix adds or updates rows. A row is done when both the API and the screen behave as written and a test proves it. Reviews walk this list against the code.

| # | Journey | Scenario | API behaviour (status + code) | App behaviour | Backend test | App test | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | Sign-in | Partner signs in with a number that is also a customer account | Same account; one person can be both | Same sign-in; this app shows only the shop side | AuthIT.firstSignIn… | e2e:register "a new owner signs up…" | OK-tested |
| 2 | Sign-in | Session key | n/a | Saved under `adp.session` (the app runs on its own site, so it never shares the customer app's session) | — | client.test | OK-tested |
| 3 | Shop gate | Signed in, no shop | `GET /shops/me` 404 NO_SHOP | ShopGate → /start: "I own a salon" / "I work at a salon" | ShopIT.withoutAShopMyShopSaysSo | e2e:register "a new owner…" | OK-tested |
| 4 | Shop gate | Kirana shop | 200 `type: KIRANA`; salon calls 409 NOT_A_SALON | "Kirana partners: coming soon" on every path; no salon call made; no bottom bar | SalonIT.salonSetupIsOnlyForSalonsAndNeedsSignIn | e2e:gate "a kirana shop sees…" | OK-tested |
| 5 | Shop gate | Owner of a DRAFT | 200 DRAFT, myRole OWNER | "/" and board paths → /register | ShopIT.registeringCreatesADraftShop… | e2e:register "a half-done registration…" | OK-tested |
| 6 | Shop gate | Helper or barber of a DRAFT or PENDING_VISIT salon | 200 | "Your salon isn't live yet" with Check again; no board | — | e2e:gate "a helper of a salon not approved yet waits…" | OK-tested |
| 7 | Shop gate | Owner of a PENDING_VISIT salon | 200 | Board with "Waiting for our field team", shop code, setup checklist; setup screens open | BookIT.registrationNeedsBothPhotosThenTheFieldTeamApprovesAfterTheVisit | e2e:register "a new owner…" | OK-tested |
| 8 | Shop gate | SUSPENDED | 200 SUSPENDED + statusReason; customers' upcoming bookings cancelled | Red banner with the reason; walk-in, pause and every appointment action hidden; day still viewable | BookIT.aSuspendedSalonDisappears… | e2e:gate "a suspended salon shows why…" | OK-tested |
| 9 | Shop gate | Approved or suspended while the app is open | n/a | `/shops/me` re-read on focus (30 s stale time) and on push; gate re-decides | — | e2e:gate "a helper… waits" (Check again) | OK-tested |
| 10 | Shop gate | `/shops/me` fails (offline, 503) | NETWORK / 503 SERVICE_BUSY | Error with Try again (retried twice first) | — | — | OK-untested |
| 11 | Shop gate | Worker added by the owner, taps "check again" | 200 shop | Fresh token (refresh) so it carries the shop, then the board | BookIT.theOwnerAddsAHelperWhoWorks… | e2e:gate "someone who works at a salon…" | OK-tested |
| 12 | Shop gate | Worker not added yet | 404 NO_SHOP | "You haven't been added to a salon yet." | — | e2e:gate "someone who works at a salon…" | OK-tested |
| 13 | Registration | Profile not complete | 403 PROFILE_INCOMPLETE | Can't happen: the SignedIn guard finishes email and name first | ShopIT.registeringAShopNeedsAVerifiedEmailAndANameFirst | e2e:register "a new owner…" | OK-tested |
| 14 | Registration | Fields wrong or missing | 400 VALIDATION_FAILED with the field named | Checked on the phone first (same limits); a backend field error shows under its field | ShopIT.wrongDetailsAreRefusedWithTheFieldNamed | unit:"registration details"; e2e:register "a new owner…" | OK-tested |
| 15 | Registration | Location allowed | n/a | GPS (high accuracy, fresh) → map pin, accuracy shown; warning above 150 m | — | e2e:register "a new owner…" | OK-tested |
| 16 | Registration | Location blocked | n/a | Step-by-step guide for Android, iPhone or computer; Try again | — | e2e:register "location blocked…" | OK-tested |
| 17 | Registration | GPS timeout / unavailable / unsupported | n/a | Banner per case; button stays | — | — | OK-untested |
| 18 | Registration | Owner drags the pin | Lat/long saved to 6 decimals | Distance moved shown; outside India refused before sending | — | unit:"registration details" | OK-tested |
| 19 | Registration | Shop type | Missing type = KIRANA | App always sends `type: SALON` | SalonIT.aShopRegisteredAsASalonSaysSo… | e2e:register "a new owner…" | OK-tested |
| 20 | Registration | App closed before the first save | n/a | Typing kept on the phone (`adp.registerDraft`), removed after saving | — | e2e:register "typing is kept…" | OK-tested |
| 21 | Registration | Registered already (another tab or phone) | 409 ALREADY_HAS_SHOP | Message; shop reloaded so the gate moves on | ShopIT.onePersonCanHaveOnlyOneShop | — | OK-untested |
| 22 | Registration | Two saves at once / stale version | 409 SHOP_CHANGED | Message; shop reloaded; next save uses the new version | ShopIT.twoEditsAtTheSameMomentNeverOverwriteEachOther | e2e:register "typing is kept… a stale save…" | OK-tested |
| 23 | Registration | GSTIN / Udyam | Optional; stored in capitals; "" removes | Upper-cased; "" sent on edit to clear | ShopIT.textIsTidiedAndGstinIsStoredInCapitals | e2e:register "a half-done registration…" | OK-tested |
| 24 | Registration | Upload right after creating the shop | Files use the token's shop; 403 SHOP_REQUIRED without it | Refresh after create, and before any upload whose token has no shop claim | FilesIT.signedInWithoutAShopCannotUploadYet | e2e:register "a new owner…" | OK-tested |
| 25 | Registration | Photo too big / not an image / HEIC | 413 FILE_TOO_LARGE; 400 for non-images | Shrunk on the phone to 1600 px JPEG (HEIC decoded by the phone where it can); errors shown under the picker | FilesIT.tooLargeFileGetsAClear413; …textFileNamedJpgIsRefused | unit:"registration details" (fitInside) | OK-tested |
| 26 | Registration | 100 uploads in a day | 429 TOO_MANY_UPLOADS | Message under the picker | FilesIT.aShopCanUploadAtMost100FilesADay… | — | OK-untested |
| 27 | Registration | Submit without both photos | 409 PHOTOS_REQUIRED | Continue and Submit stay off until both are set; refusal reloads the shop | BookIT.registrationNeedsBothPhotos… | e2e:register "a new owner…" | OK-tested |
| 28 | Registration | Submit | 200 PENDING_VISIT | Board with the waiting card and shop code | BookIT.registrationNeedsBothPhotos… | e2e:register "a new owner…" | OK-tested |
| 29 | Registration | Field team sends it back | DRAFT + statusReason; SHOP_NOT_APPROVED message | Reason banner on step 1 and step 3; owner fixes and submits again | BookIT.aShopWhoseVisitDidntPassGoesBackToDraftWithTheReason | e2e:register "a half-done registration…" | OK-tested |
| 30 | Registration | Approved | APPROVED; SHOP_APPROVED message | Board without the waiting card | BookIT.registrationNeedsBothPhotos… | — | OK-tested (backend) |
| 31 | Registration | Reinstated after suspension | SUSPENDED → PENDING_VISIT | Owner: board + waiting card; staff: "not live yet" | BookIT.aSuspendedSalonDisappears…ItCanComeBack | — | OK-untested |
| 32 | Roles | Tabs | n/a | Owner and helper: Today, Bookings, Salon, More; barber: Today, Bookings, More | — | unit:"what each role may do"; e2e:gate "each role sees its own tabs…" | OK-tested |
| 33 | Roles | Barber opens a setup or Team address | Setup reads allowed; changes 403 OWNER_ONLY | Route guard sends him to the board | SalonIT.aHelperSeesTheSetupButOnlyTheOwnerChangesIt | e2e:gate "each role…" | OK-tested |
| 34 | Roles | Helper opens setup | Reads 200, changes 403 OWNER_ONLY | "Only the owner can change these."; no add/edit/switches | SalonIT.aHelperSeesTheSetup… | e2e:gate "a helper has Salon to look at…" | OK-tested |
| 35 | Roles | Helper opens Team or closed days | 403 OWNER_ONLY | Not in More; address sends to the board | — | e2e:gate "a helper has Salon…" | OK-tested |
| 36 | Roles | Role changes while the app is open (helper removed) | Sessions ended at once → 401 → refresh refused | Signed out to /signin | BookIT.theOwnerAddsAHelper…CanBeRemoved | — | OK-untested |
| 37 | Board | Owner or helper | `GET /salon/day` a column per active barber (+ switched-off ones who had work) | "Everyone" plus a chip per barber; each barber's hours line | BookIT.aBarberWithWalkInAccessSeesEveryBarber… | e2e:day several | OK-tested |
| 38 | Board | Barber without walk-in access | Only his column | No chips; his hours only | BookIT.aBarberWithASignInSeesAndWorksOnlyHisOwnDay | e2e:gate "each role…" | OK-tested |
| 39 | Board | Other days | `?date=` any India date | ‹ › and Back to today; 31 days back, 30 ahead; address `?date=` (where messages point); bad dates fall back to today | — | e2e:day "the board is per day…" | OK-tested |
| 40 | Board | Refresh | n/a | Every 30 s, on focus, and on a push message | — | e2e:day "the board is per day…" (new booking appears) | OK-tested |
| 41 | Board | Short outage | 503 SERVICE_BUSY + Retry-After | Waits and retries (client, then the query twice), then error with Try again | — | e2e:day "the board is per day…" | OK-tested |
| 42 | Board | Booking whose time started | `notStarted: true` | Amber border and "Not started" pill | BookIT.appointmentsInServiceEnd… | e2e:day "no-show opens…" | OK-tested |
| 43 | Board | Done, cancelled, no-show | Statuses | Folded under "Done, cancelled and no-shows (n)" | — | e2e:day "the customer cancelled…" | OK-tested |
| 44 | Board | Customer name and phone | Owner and helper get the phone; barbers null | Call button (tel:+91…) for owner and helper only | BookIT.theOwnerSeesTheCustomersPhoneToCallButABarberNeverDoes | e2e:day "the owner starts…", "a barber works his own…" | OK-tested |
| 45 | Board | No barbers yet | Empty columns | "No barbers yet" with Add barbers (owner) | SalonIT.aSalonWithNoBarbersYetGetsAnEmptyList | — | OK-untested |
| 46 | Board | Setup checklist | n/a | Owner sees three items until a barber has an active service and hours | — | e2e:setup "a new owner's checklist…" | OK-tested |
| 47 | Start | Right code | 200 IN_SERVICE | "Started." and "In chair" | BookIT.startNeedsTheCustomersCodeAndLocksAfterFiveWrongTries | e2e:day "the owner starts…" | OK-tested |
| 48 | Start | Wrong code | 400 WRONG_CODE (tries left in the message) | Message; box cleared | BookIT.startNeedsTheCustomersCode… | e2e:day "the owner starts…" | OK-tested |
| 49 | Start | Five wrong codes | Locked: only "without code" works | Message; the owner or helper uses "start anyway" | BookIT.startNeedsTheCustomersCode… | — | OK-untested |
| 50 | Start | Too early (over 15 min before) | 409 WRONG_STATUS "Too early…" | Backend message | BookIT.startNeedsTheCustomersCode… | — | OK-untested |
| 51 | Start | Past the 15-minute hold | 409 WRONG_STATUS "…is a no-show now. Add the customer as a walk-in." | Backend message; board reloads | BookIT.appointmentsInServiceEnd… | — | OK-untested |
| 52 | Start | Without code | Owner or helper only; barber 403 NOT_ALLOWED | "Customer can't show the code: start anyway" for owner and helper only | BookIT.startNeedsTheCustomersCode… | e2e:day "a helper can start without the code…", "a barber works his own…" | OK-tested |
| 53 | Start | Customer cancelled meanwhile | 409 WRONG_STATUS | Message; day reloads; sheet shows the new status | — | e2e:day "the customer cancelled while the sheet was open…" | OK-tested |
| 54 | Start | Double tap | n/a | Buttons locked while a call runs | — | e2e:day "give a booking… cancel" (dblclick, one call) | OK-tested |
| 55 | No-show | Before 15 min after start | 409 WRONG_STATUS | Button off: "No-show from 4:45 PM" | BookIT.noShowIsAllowedFifteenMinutesAfterTheStart… | e2e:day "no-show opens…" | OK-tested |
| 56 | No-show | Marked | 200 NO_SHOW; online customer gets a strike and a message | Confirm text says so; "Marked as no-show." | BookIT.noShowIsAllowed… | e2e:day "no-show opens…" | OK-tested |
| 57 | No-show | Automatic | The job marks it within a minute of the hold ending | Next refresh shows it | BookIT.appointmentsInServiceEnd…UnstartedOnesBecomeNoShows… | — | OK-tested (backend) |
| 58 | No-show | Undo within 24 h | Owner or helper; strike removed; back to CONFIRMED if time left and barber free, else closed as cancelled by salon | "Undo no-show" for owner and helper | BookIT.aNoShowIsUndoneByTheOwner… | e2e:day "no-show opens…" | OK-tested |
| 59 | No-show | Undo after 24 h | 409 WRONG_STATUS | Backend message | BookIT.afterADaySupportTakesBackTheStrike… | — | OK-untested |
| 60 | Reassign | To a free barber who does the services | 200 | "Given to another barber." | BookIT.reassignMovesABookingToAnotherFreeBarber | e2e:day "give a booking…" | OK-tested |
| 61 | Reassign | Barber busy / taken at that moment | 409 BARBER_BUSY / TRY_AGAIN | Message; stays on the choice to try again | BookIT.reassigningOntoTimeTakenAtTheSameMomentIsRefused | e2e:day "give a booking…" | OK-tested |
| 62 | Reassign | Barber doesn't do a service | 400 VALIDATION_FAILED | Backend message | — | — | OK-untested |
| 63 | Cancel | With a reason (2–200) | 200 CANCELLED_BY_SALON; reason sent to the customer; no strike | Reason box with counter; button off under 2 letters | BookIT (salon cancel) | e2e:day "give a booking… cancel…" | OK-tested |
| 64 | Walk-in | Options for chosen services | `GET walk-ins/options` free now first, then next free time, then none today | Free-now barbers selectable; busy ones show "free at 4:30 PM" | BookIT.walkInSuggestionsAndWalkInsOnlyStartNow | e2e:day "a walk-in: services…" | OK-tested |
| 65 | Walk-in | Add | 201 IN_SERVICE at once; Idempotency-Key required | Key per walk-in; renewed when services or barber change | BookIT.walkInRetriesReturnTheSameWalkIn… | e2e:day "a walk-in…" | OK-tested |
| 66 | Walk-in | Double tap / retry after a lost answer | Same key → same walk-in | One request on a double tap; network retry keeps the key | BookIT.walkInRetries… | e2e:day "a walk-in…" | OK-tested |
| 67 | Walk-in | Barber taken meanwhile | 409 BARBER_BUSY + `details.freeAt` | Message; choice cleared; options reloaded | BookIT.aBookingRacingAWalkInForTheSameBarber… | e2e:day "a walk-in for a barber who just got busy…" | OK-tested |
| 68 | Walk-in | No access | 403 WALK_INS_NOT_ALLOWED | "Walk-ins need the owner's OK" (button shown to all; the app can't read its own access) | BookIT.onlyTheOwnerAndPeopleHeGaveAccessToCanAddWalkIns | e2e:day "…someone without walk-in access" | OK-tested |
| 69 | Walk-in | Other days | Walk-ins start now | "+ Walk-in" only on today's board | — | e2e:day "the board is per day…" | OK-tested |
| 70 | Walk-in | No barber does all chosen services | Empty options | "No barber does all of these services." | — | — | OK-untested |
| 71 | Break | Free time | 201 BLOCKED | Saved; board opens on that day | BookIT.aBlockOverABookingIsRefusedUntilTheBookingIsMoved | e2e:setup "a break with a booking in the way…" | OK-tested |
| 72 | Break | Booking in the way | `conflicts` lists them; add 409 BLOCK_CONFLICTS `details.appointments` | Listed with links to that day; nothing saved | BookIT.aBlockOverABookingIsRefused… | e2e:setup "a break with a booking…" | OK-tested |
| 73 | Break | Booked between the check and the save | 409 BLOCK_CONFLICTS | Same list from the refusal | — | — | OK-untested |
| 74 | Break | End before start / over 12 h / in the past | 400 VALIDATION_FAILED `endAt` | End after start checked first; backend reasons shown | — | unit:"breaks and leave" | OK-tested |
| 75 | Break | Barber for himself only | Another barber → 404 STAFF_NOT_FOUND | Barber's own profile found by his linked phone; no barber choice | BookIT.aBarberWithASignInSeesAndWorksOnlyHisOwnDay | e2e:setup "leave is for the owner…" | OK-tested |
| 76 | Break | Barber sign-in not linked to a profile | n/a | "Your sign-in isn't linked to a barber profile." | — | — | OK-untested |
| 77 | Leave | Owner only, whole India days, at most 30 | Helper 403 OWNER_ONLY; over 30 days 400 | Leave choice only for the owner; first–last day inclusive | BookIT.aLeaveReachingOutsideAClosedDay… | unit:"breaks and leave"; e2e:setup "leave is for the owner…" | OK-tested |
| 78 | Break/leave | Remove | 204; leave only by the owner | "Remove break/leave" on the block's sheet | — | e2e:setup "a break with a booking…" | OK-tested |
| 79 | Closed day | Add | Owner only; one CLOSED block per barber; 409 BLOCK_CONFLICTS if anything that day; 409 NO_ACTIVE_BARBERS | Date picker (90 days); conflicts listed | BookIT.aClosedDayIsAllOrNothing… | e2e:setup "the owner closes a day…" | OK-tested |
| 80 | Closed day | Open again | 204 | "Open again" | BookIT.aClosedDayIsAllOrNothing… | e2e:setup "the owner closes a day…" | OK-tested |
| 81 | Pause | Pause | Owner or helper; until (default end of today), at most 30 days | 1 hour / rest of today / end of tomorrow | BookIT.pausingHidesTheSalonAndStopsBookingsUntilResumed | unit:"pausing"; e2e:setup "pause online bookings…" | OK-tested |
| 82 | Pause | Resume | 200 | Banner with Resume | BookIT.pausingHides… | e2e:setup "pause…" | OK-tested |
| 83 | Pause | Barber | 403 | Not shown | — | — | OK-untested |
| 84 | Bookings | Coming up | `GET /salon/upcoming` up to 200, soonest first | Grouped by India date; tap opens that day | BookIT.theUpcomingListShowsWhatsComingAcrossDaysSoonestFirst | e2e:team-and-account "the history…" (empty) | OK-tested |
| 85 | Bookings | History | Owner or helper; up to 31 days; counts, completed total, 500 max | Range pickers (checked first), totals, "latest 500" note | BookIT.theOwnersHistoryCountsTheDayAndWhatWasDone | e2e:team-and-account "the history…" | OK-tested |
| 86 | Services | Add / edit | 201/200; 409 SERVICE_NAME_TAKEN; 409 SERVICE_CHANGED; field errors | Checked first (2–60 letters, 5–480 min, price to the paisa); backend errors under fields | SalonIT.ownerAddsServices…; …twoActiveServicesCantShareAName… | unit:"services"; e2e:setup "the owner adds a service…" | OK-tested |
| 87 | Services | Switch off / on | PATCH active; old bookings keep names | Switch per service | SalonIT.switchingOneBackOnCountsLikeAddingIt | e2e:setup "the owner adds a service…" | OK-tested |
| 88 | Services | Too many | 409 TOO_MANY_SERVICES | Backend message | SalonIT.onlyActiveServicesAndBarbersCountTowardsTheLimits | — | OK-untested |
| 89 | Barbers | Add | 201 | Name sheet → his page | SalonIT.ownerAddsABarberAndSetsHisServicesAndWeek | e2e:setup "a new owner's checklist…" | OK-tested |
| 90 | Barbers | Services he does | PUT with version; switched-off service can't be added | Active services listed; a switched-off one he has stays listed | SalonIT.aSwitchedOffServiceCantBeGivenToABarber | e2e:setup "a new owner's checklist…" | OK-tested |
| 91 | Barbers | Weekly hours | PUT with version; 15-min steps; no overlap | Checked first; two shifts a day; "Copy Monday to Tue–Sat" | SalonIT.wrongHoursAreRefusedWithTheProblemNamed | unit:"weekly hours"; e2e:setup "a new owner's checklist…" | OK-tested |
| 92 | Barbers | Hours or services that would strand bookings | 409 BOOKINGS_IN_THE_WAY | Backend message | BookIT.newHoursOrServicesCantStrandABarbersUpcomingBookings | — | OK-untested |
| 93 | Barbers | Switch off with bookings | 409 STAFF_HAS_BOOKINGS | Message; switch stays on | BookIT.aBarberWithUpcomingBookingsCantBeSwitchedOff | e2e:setup "switching off a barber…" | OK-tested |
| 94 | Barbers | Stale edit | 409 STAFF_CHANGED | "Someone changed this barber meanwhile…"; typing kept; next save uses the new version | SalonIT.aStaleBarberEditIsRefused | e2e:setup "two people editing a barber…" | OK-tested |
| 95 | Barbers | Give / remove sign-in | PUT/DELETE login; LOGIN_EXISTS; sessions end on removal | Phone normalised; messages | BookIT.aBarberAddedWithoutAskingCanLeave… | e2e:setup "a new owner's checklist…" | OK-tested |
| 96 | Barbers | Photo | STAFF_PHOTO upload then PUT photo | Shrunk, uploaded, set | BookIT.aBarberPhotoIsOptionalAndMustBeAStaffPhotoOfThisSalon | — | OK-untested |
| 97 | Rules | Save from defaults | PATCH with version null; 409 SETTINGS_CHANGED if stale | 0–1440 min, 1–30 days checked first | SalonIT.settingsStartAsTheDefaultsAndTheFirstSaveCreatesThem | e2e:setup "booking rules save from the defaults…" | OK-tested |
| 98 | Team | Add helper | 200; 409 ALREADY_IN_A_SHOP; 409 TOO_MANY_HELPERS | Phone normalised; messages | BookIT.theOwnerAddsAHelperWhoWorks… | e2e:team-and-account "the owner adds a helper…" | OK-tested |
| 99 | Team | Walk-in access | PUT per member | Switch per helper or barber | BookIT.onlyTheOwnerAndPeopleHeGaveAccessTo… | e2e:team-and-account "the owner adds a helper…" | OK-tested |
| 100 | Team | Remove helper | 200; their sessions end | Confirm sheet | BookIT.theOwnerAddsAHelper…CanBeRemoved | e2e:team-and-account "the owner adds a helper…" | OK-tested |
| 101 | Account | Helper or barber leaves | 204; owner 409 OWNER_CANT_LEAVE | "Leave <salon>" for non-owners; signs out after | BookIT.theOwnerAddsAHelper…OrLeave | e2e:team-and-account "a helper leaves…", "the owner has no leave…" | OK-tested |
| 102 | Account | Delete account | Owner refused | Not offered in this app (the customer app has it) | — | — | N/A-v1 |
| 103 | Messages | Inbox | `?app=partner` → SALON_* and SHOP_* only | Icons per type; tap marks read and opens the day or "/" | InboxIT / BookIT.theInAppListShowsEachAppItsOwnMessages… | e2e:team-and-account "messages…" | OK-tested |
| 104 | Messages | Push for a customer message to a person who is also a partner | Push isn't per app | Worker opens only `/salon/*` or `/shops/*`; anything else opens the board | — | unit:"messages" (safePath) | OK-tested |
| 105 | Messages | Push prompt | n/a | Card on the board until answered | — | — | OK-untested |
| 106 | Session | Access token expired, several calls and tabs | One refresh at a time across tabs | Never the same refresh token twice | AuthIT.refreshRotates… | e2e:team-and-account "an expired session refreshes…" | OK-tested |
| 107 | Time | Phone set to another zone, near midnight | Backend days are India days | All dates and times in India time | — | unit:"breaks and leave", "the day" | OK-tested |
