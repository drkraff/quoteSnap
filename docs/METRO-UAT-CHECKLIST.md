# Metro morning UAT — first-win quoting

Short **physical-device** checklist the founder can run after **14:00** over USB + Metro. **No emulator.** This is the skip-catalog quoting loop on `master`, not Phase 5 voice-pipeline UAT and not Phase 6 SMS.

Device setup (LAN `EXPO_PUBLIC_API_URL`, firewall, `adb`, Metro): [`.planning/PHYSICAL-DEVICE-TESTING.md`](../.planning/PHYSICAL-DEVICE-TESTING.md). Longer voice-pipeline tests: [UAT-PHASE5.md](UAT-PHASE5.md).

**Out of scope for this run (do not mark as done):** Twilio / in-app **Send** SMS, a hosted approval page, EAS/Railway live demo, Whisper Hebrew, GPT-4o Vision (`PHOTO-01`), or old-quote OCR.

---

## Preconditions

All must be true before item 1.

| Item | Detail |
|------|--------|
| Window | After 14:00 local. Physical phone only — not an emulator, not Expo Go. |
| Metro | USB + `npm run android` from `apps/mobile`. Same Wi-Fi as the laptop. |
| API URL | Gitignored `apps/mobile/.env`: `EXPO_PUBLIC_API_URL=http://<LAN-IP>:3000`. Phone browser can load `http://<LAN-IP>:3000/health`. Fallback `10.0.2.2` is emulator-only. |
| Backend | `apps/backend` `npm run dev` on 3000 with `DATABASE_URL`, `JWT_ACCESS_SECRET`, `OPENAI_API_KEY`, R2 keys. Whisper default is English (`en`). |
| Native modules | Photos and **Share quote** need a native rebuild that includes `expo-image-picker`, `expo-print`, and `expo-sharing` (not Expo Go). |
| Clean account | Prefer a new register. Hard reset: `adb shell pm clear com.quotesnap.app`. |

Mark each row **pass / fail / blocked**. Note surprises in **obs**. Do not commit screenshots.

---

## 1. New account — trade + hourly, skip catalog

Register. On **Choose your trade**: pick a trade, type an hourly labor rate (markup optional). Tap **Start quoting** (not **Load starter catalog**).

| # | Check | Result | Obs |
|---|-------|--------|-----|
| 1.1 | Ready copy says there is no starter catalog; labor uses the hourly rate when hours are spoken; unknown prices stay blank | | |
| 1.2 | Lands on Quotes. Catalog can be empty. First quote is not blocked | | |

---

## 2. Voice adhoc lines — spoken $ / learned / labor×hourly / blank never invent

**Voice Quote** FAB. Speak English. After stop, Quotes shows **Processing...** then a draft (toast **Your quote is ready — tap to review**). No catalog SKU required.

Use **separate recordings** (or clearly named lines) so attach order is obvious: spoken sell → exact rate-card name+unit → hours × hourly → blank.

Suggested prompts (adjust names; do not expect invented catalog prices):

1. Spoken sell: “Replace a garbage disposal, eighty dollars.”
2. After you have confirmed a price for that name in item 3: say the **same name and unit** with no dollar amount — expect the learned rate (**Known**, quiet).
3. Labor: “Two hours of labor.” — unit price should be 2 × the hourly from onboarding, labeled **from your rate**.
4. Blank: “Replace a mystery widget” with **no** dollar amount and **no** matching My rates row — price stays **blank / Unknown**. Never a guessed SKU price or `$0.00` as if it were real.

| # | Check | Result | Obs |
|---|-------|--------|-----|
| 2.1 | Spoken dollar amount fills the line; draft can show **you said** | | |
| 2.2 | Exact name+unit match to a learned My rates row fills from the rate card (not a new guess) | | |
| 2.3 | Hour-unit labor = hours × signup hourly (**from your rate**) | | |
| 2.4 | No spoken $, no catalog SKU, no exact rate-card hit → price **blank**. App does not invent a number | | |

Voice attach order (do not reverse in notes): spoken sell → catalog SKU (none if you skipped seed) → exact rate card → computed labor (hours × hourly) → computed material (cost × markup when both known) → blank.

---

## 3. Price edit learns the rate card; My rates search

On a draft line with a name, **Edit price**, type a unit price, confirm. Catalog → **My rates**.

| # | Check | Result | Obs |
|---|-------|--------|-----|
| 3.1 | The confirmed name+unit appears on My rates with the price you typed (last confirmed; not invented) | | |
| 3.2 | **Search rates** filters the list by name substring (`q`). Voice attach still needs an **exact** name+unit match — search is list UX only | | |

---

## 4. Rooms, photos, Import from photo (blank-price stub)

Open a **Manual Quote** or the voice draft. Native picker required.

| # | Check | Result | Obs |
|---|-------|--------|-----|
| 4.1 | **Add room** (e.g. Kitchen). Lines can sit in a room or stay ungrouped. Totals unchanged | | |
| 4.2 | **Add photo** (library is enough). Still only — thumbnail on the contractor draft. Price unchanged. Photos are job evidence, not a public URL | | |
| 4.3 | **Import from photo**: camera or library. New adhoc line named from the filename stem or **Imported item**. **Price stays blank.** Hint: *Creates a draft line. Price stays blank until you type it.* Does not parse `$` from the picture (Vision is not wired) | | |

---

## 5. Share PDF Assumptions; cancel does not mark sent; empty quote blocked

**Share quote** is the customer file path (OS share sheet). It is **not** SMS. In-app **Send** still only queues locally.

On a draft with at least one customer-facing line:

1. Type a **Client sentence** (placeholder **Leave blank if none** is hint-only).
2. Optional: a private (internal-only) job/line note — must **not** appear in the file.
3. Tap **Share quote**. Open the PDF (or HTML fallback) in Files / Drive — do not send to a real customer.

| # | Check | Result | Obs |
|---|-------|--------|-----|
| 5.1 | File shows a labeled **Assumptions** block with the client sentence. Empty/whitespace sentence omits the whole block (no placeholder copy) | | |
| 5.2 | Blank prices stay blank in the file. Private notes and photos are absent | | |
| 5.3 | After a **successful** share, history shows **Sent**. Customer phone is not required and is not invented | | |
| 5.4 | New draft → **Share quote** → **cancel** the OS sheet. Alert: *Share was cancelled. The quote was not marked sent*. Status stays Draft, not Sent | | |
| 5.5 | Empty quote (no customer-facing lines) → **Cannot share** / **Add at least one item before sharing**. Not marked sent | | |

---

## 6. Offline voice queue / resume (poke if there is time)

Skip if the morning is already long. Full procedure: PHYSICAL-DEVICE-TESTING tests 5.2 and FAIL-07.

| # | Check | Result | Obs |
|---|-------|--------|-----|
| 6.1 | Airplane mode → **Voice Quote** → stop. Quotes row shows **Queued** (not a mid-flow error). Wi-Fi back → **Processing...** then draft. No duplicate rows | | |
| 6.2 | While recording or editing a draft, force-stop the app. Relaunch: **Resume where you left off** (Resume / Not now) | | |

---

## After the run

1. Phase 5 mic/catalog pipeline (if still unsigned): [UAT-PHASE5.md](UAT-PHASE5.md).
2. Keep LAN `EXPO_PUBLIC_API_URL` out of git.
3. This checklist passing does **not** close SMS, EAS demo, or Vision.
