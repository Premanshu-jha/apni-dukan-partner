# Translation review: what a native speaker should read first

The app's texts in Hindi, Telugu, Marathi, Tamil and Kannada were first written by AI. Each language should be read
once by someone who speaks it daily and knows how salon and shop owners talk. The words are in
`src/i18n/<language>/*.json` (hi, te, mr, ta, kn), the same keys as `src/i18n/en/`. Change a value, never a key, and
keep `{blanks}` as they are. The CI check (`src/i18n/i18n.test.ts`) catches a missing or broken one.

## Choices made the same way in every language (say if any should change)

- **Loanwords kept in the language's script:** salon, booking, walk-in, offer, discount, service, stock, bill,
  code, photo, video, app, link, account, subscription. Shopkeepers say these words; the "pure" words read bookish.
- **Barber:** written as the English word (बार्बर, బార్బర్, …), not नाई / न्हावी. Those are also community names.
- **AM / PM, "min", "h":** left in Latin letters. सुबह/शाम would be wrong for 1 PM or 11 PM.
- **Phone menu names** (Settings, Privacy & Security, Allow, Add to Home Screen) are left in English, as most phones
  show them.
- **Digits** are 0-9 everywhere.
- **Brand names:** "Clozest", "Razorpay", "UPI", "GST", "FSSAI", "AutoPay" stay in Latin letters.
- **"Licensed" badge:** "लाइसेंसशुदा" / "లైసెన్స్ ఉంది" / "लायसन्स आहे" / "லைசென்ஸ் உள்ளது" / "ಲೈಸೆನ್ಸ್ ಇದೆ".
  This must match the customer app's wording once that app is translated.

## Texts to look at first, in every language

1. **Sentences split around a link or a bold value** (keys ending in `Before`, `Middle`, `After`, `Link`, `Or`).
   These were reordered to fit each language. Some end with ":" before the value where English doesn't. Read them on
   the screen:
   - "We sent a code to …" (`auth.codeSent*`, `auth.emailSent*`, `auth.recoverSent*`)
   - "To delete your account, close or hand over your shop first" (`profile.deleteFirst*`)
   - "Want someone else to run it?" (`shop.closeHandOver*`)
   - "Ask us" (`subscription.suspended*`)
   - "We've got it: ticket …" (`help.gotIt*`)
2. **A field name followed by the backend's reason** ("The price" + "must be …", in `field.json` and `server.json`).
   Gender agreement in Hindi and Marathi may read slightly off for some fields.
3. **"No-show", "in chair", and the "missed-booking strike"** (`day.statusNoShow`, `day.statusInService`,
   `day.confirmNoShowBooking`). There is no everyday word for "strike", so the wording was made up.
4. **Rating tags** (`ratings.tag*`). Check whether they are too long for the small chips.
5. **First-person sentences** ("I work at a salon", "I understand"). Hindi and Marathi use "करता/करती हूँ" (both
   genders, with a slash).
6. **Month and weekday short forms** (`offers.month*`, `shop.monthShort*`, `day.weekday*`), especially Kannada.
7. **Long buttons:** "Hand over" in Kannada (ಬೇರೆಯವರಿಗೆ ವಹಿಸಿಕೊಡಿ) and "No-show" in Marathi.

## Not translated on purpose

- The legal pages (About, Terms, Privacy, Refunds, Delivery, Contact) stay in English.
- The backend messages that contain a name or a number stay in English (about 36 of them).
- What people type, and data from the backend (names, services, ratings' labels), is shown as it is.
