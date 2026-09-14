# QuoteSnap — Voice-to-Quote Design

Status: working spec for Grok Bot  
Audience: English-speaking global market first  
Scope: how a contractor goes from a job-site walk to a priced PDF, without building a catalog first.

## 1. Product bet

QuoteSnap is a field tool, not a price-book admin tool.

The contractor captures scope while walking the job. He commits prices when he is ready — sometimes later in the truck, sometimes at the client’s table before he leaves. The catalog is not onboarding. The catalog is what the product learns from quotes he already had to write.

If first value requires a spreadsheet of items, formulas, and rates, the product is dead. If every quote is a blank PDF with no memory, there is no reason to pay monthly.

Two job shapes, same loop:

| Shape | Capture | When he prices | Example |
| --- | --- | --- | --- |
| Small service | one short memo + 1–3 photos | later, customer not watching | 3 outlets, burnt kitchen box, add a breaker |
| Walking estimate | room-by-room voice + photos + a few typed notes | often before he leaves | kitchen remodel + two baths + floors + paint |

Do not ship only the small-service loop. A subscription is easier to justify on the walking-estimate jobs.

## 2. What we are not building

- Upfront catalog setup as a gate to the first quote
- Dimensional formula studio (length × width × rate) as onboarding
- Invented line-item prices from a generic trade list
- A one-shot “explain the whole priced quote to the AI” monologue
- Training an ASR model from scratch
- Live gray *guessed* prices while the client is watching
- Localized / RTL UI as an MVP requirement

Parsing qty + unit from speech is in scope. Asking him to predefine formulas is not.

## 3. Hard rules

1. Capture and *committing* price are separate actions. Review can happen on site or later.
2. Never guess a line-item price. Unknown → blank + flagged.
3. Spoken numbers win when they exist. Do not overwrite them.
4. Labor may be computed from signup defaults + spoken hours. That is math, not a guessed SKU price.
5. Qty + unit spoken on site are stored even when the rate is blank (`14 linear ft`, `380 sq ft`, `2 hours`).
6. Every price he types or confirms is remembered against the phrase / line he used.
7. Plausible-and-wrong is fatal. Empty-and-honest is acceptable.
8. First quote must work with zero catalog.
9. Client-facing scope and private notes are different objects. Private notes never hit the PDF.

## 4. Why catalog-first is wrong

Contractors do not price from a clean SKU list. They price from memory, last similar job, hours, a few materials, and markup. Jobs have exceptions. A prebuilt catalog always feels incomplete, so they never finish setup.

They also usually will not negotiate margin out loud with the customer two meters away. Asking for a complete priced monologue on site fights how small jobs happen.

On a multi-room remodel walk they *will* show a draft before leaving — but those numbers must be *their* rates or blanks, not a starter pack.

The catalog idea is not the problem. Making him build it before he gets a PDF is the problem. Kill the upfront catalog. Keep the learned catalog.

## 5. Signup (≤ 30 seconds)

Required:

- Trade (electrical, plumbing, painting, HVAC, handyman, remodeling, …)
- Hourly labor rate
- Material markup %

Optional, strongly encouraged:

- Upload 3 old quotes (PDF, photo, scan, or messaging screenshot)

Old quotes are the preferred seed. Extract line names, units, and prices into *his* rate card so quote #1 is not all blanks. This is import-and-learn, not a catalog wizard.

Do not ask him to name every service he offers.

## 6. Core loop

### 6.1 On site — capture

Default control: **New job → rooms**, not one blob.

Each room/zone is a clip: voice + photos + optional typed note. He can also do a single short memo for small jobs.

He talks half to the client, half to the phone. That is expected. He can say “I’m recording so I don’t forget” — that is the social cover.

He describes scope, condition, quantities, hours, supplier runs, exceptions. Prices are optional and often absent while the client is present.

Small-job example:

> Three outlets in the living room, straight swap. The kitchen one is burnt, that one needs a new back box too. Panel's full, I need to add a breaker. Call it two hours, plus a run to the supplier.

Walking-estimate example (kitchen clip):

> Kitchen. Tear out the old cabinets, countertop, and sink, haul-away included. New laminate cabinets, about 14 linear feet upper and lower, soft-close drawers. Quartz counter, about 12 feet, 3cm. Move one water line 16 inches left. Two extra outlets above the counter. Tile backsplash. Appliances not included.

Photos attach to the current room, then to the nearest line after extract. A 3-second video is allowed; treat it as extra context, not a separate product.

Typed notes are first-class for things voice mangles: exact tap model, “don’t touch the neighbor’s pipe,” “client undecided shower vs tub.”

Access constraints belong in capture (“third floor, no elevator”) so debris / carry lines do not get forgotten.

### 6.2 Review — two clocks

Same draft UI. Two moments it can open:

- **Before leaving** (walking estimate / sale still warm)
- **Later in the truck or at home** (small job, customer was next to him)

App turns clips into line items grouped by room. Labor is filled if hours were spoken. Known rates fill from *his* book or imported quotes. Unknown prices stay blank.

```
| Room        | Line                        | Qty         | Price    |
| ----------- | --------------------------- | ----------- | -------- |
| Kitchen     | Kitchen tear-out + haul-away| 1           | 1,800    |  ← learned / imported
| Kitchen     | Laminate cabinets           | 14 lin ft   | ⚠️ blank |
| Kitchen     | Quartz countertop           | 12 ft       | ⚠️ blank |
| Electrical  | Replace outlet (standard)   | 3           | 250 ea   |
| Electrical  | Replace outlet + back box   | 1           | ⚠️ blank |
| Job         | Labor                       | 2 h         | 150/h    |  ← hours × signup rate
```

He taps blanks, types numbers, optionally adds an alternate option, sends PDF (email, SMS, or WhatsApp). Target for a small job: two minutes. Target for a multi-room walk: still on site if he wants to close.

Gray live suggestions while walking are allowed only for **Known** rates (his book / import). Never flash a guessed $185/ft in front of the client.

### 6.3 After send — learn

Persist:

- normalized line name
- raw phrase from transcript
- unit, qty, price
- room / zone
- trade, optional job tags
- source: imported | typed | confirmed | spoken
- visibility: client | internal

Next time a similar line appears, auto-fill his price. Quote #1 he types. Quote #5 half auto-fills. Quote #20 he confirms.

That learned book is the lock-in. A competitor does not have his 200 prices.

## 7. Draft quality flags

| State | Meaning | UI |
| --- | --- | --- |
| Known | Price from his history or imported quotes | filled, quiet |
| Computed | Labor = hours × his rate, or materials × markup when a cost was spoken | filled, marked “from your rate” |
| Spoken | He said the number on the recording | filled, marked “you said” |
| Unknown | No trusted price | blank + flag — never a guess |

He should only need to touch Unknown rows.

## 8. Quote objects the walkthrough proved we need

These stay thin. They are not a second product.

- **Rooms / zones** as the capture unit
- **Qty + unit** parsed from speech (`each`, `hour`, `sq ft`, `linear ft`)
- **Option groups:** base line + alternate (walk-in shower vs keep the tub) so he does not rewrite the job tonight
- **Private notes** on the job or a line (subcontractor check, moisture from neighbor)
- **Photo-on-line** so later nobody says “this isn’t what we meant”
- **Client sentence** at the top of the PDF (“Appliances and decorative lighting not included.”)
- **Send from the phone** via email / SMS / WhatsApp

Payment schedule, tax block, 48-hour follow-up, AR tape: real, not MVP-critical. Store a measurement if he speaks it or types it. Do not build AR for v1.

## 9. Voice pipeline

Do not treat Whisper as the quoting brain.

```
room clips + photos + typed notes
  → ASR (Whisper or gpt-4o-transcribe)
  → jargon repair (his term list + last line names + imported quote terms)
  → structured extract (JSON line items, grouped by room)
  → price attach (spoken > learned/imported > computed labor > blank)
  → review UI
  → PDF / send
```

Extraction target:

```json
{
  "job_title": "Cohen kitchen and bath remodel",
  "rooms": [
    {
      "name": "kitchen",
      "line_items": [
        {
          "name": "Laminate kitchen cabinets",
          "raw_span": "new laminate cabinets, about 14 linear feet upper and lower",
          "kind": "labor|material|assembly|fee",
          "qty": 14,
          "unit": "linear_ft",
          "unit_price": null,
          "price_source": "spoken|learned|imported|computed|unknown",
          "option_group": null,
          "visibility": "client",
          "photo_ids": [],
          "confidence": 0.8,
          "notes": ""
        }
      ]
    }
  ],
  "spoken_hours": null,
  "internal_notes": ["third floor no elevator — debris surcharge"],
  "missing": ["kitchen cabinet rate"],
  "assumptions": ["appliances not included"]
}
```

ASR improvement without training from scratch:

- `initial_prompt` / prompt with his terms and brands
- LLM repair pass using his glossary
- log audio + transcript + edited quote
- few-shot retrieve his similar past jobs into the extract prompt
- fine-tune only later if jargon WER is still the bottleneck

Expect messy speech, not the clean estimator monologue in the sample transcript. The compounding asset is corrected quotes, not a custom base model.

## 10. Rate card (the catalog we keep)

Not a setup screen. A byproduct.

- Key: normalized name + unit (+ optional trade)
- Value: last price, optional price history, use count
- Match: embedding / fuzzy on name + raw phrase
- Conflict: if he types a new price, that becomes current; keep history

No requirement to open “My catalog” to use the app. A simple list can exist later for editing rates in bulk.

Assemblies beat SKUs. “Water heater swap” or “kitchen tear-out + haul-away” can stay one line. Exploding into nipples and flex lines is opt-in.

## 11. Secondary paths (do not design the whole app around these yet)

- **Alone / speak prices:** if he records without a customer, accept spoken unit prices and totals. Spoken wins.
- **Clone last job:** “same as Miller bathroom, add a vanity light.”
- **Good / better / best** or A/B options: after the basic loop works. Option groups are the thin version and belong earlier than full tier packages.
- **AI follow-up questions:** at most 3–6 missing slots, only when extraction is incomplete. Not an interrogation.

## 12. Onboarding narrative to sell

Not: “Set up your catalog, then talk.”

Yes: “Walk the job like you already do. The draft is waiting before you leave — or later in the truck. After a few jobs it already knows your numbers.”

Optional first action: “Upload three old quotes so the first draft is closer to you.”

## 13. MVP slice

Must have:

- Signup: trade, hourly, markup
- Optional old-quote import → seed rate card
- Room-by-room voice + photos + typed note; single-memo still works
- Extract lines with qty/unit + attach prices by the hard rules
- Private notes
- One alternate-option pair per undecided item
- Review on site or later, edit blanks, send PDF + email / SMS / WhatsApp
- Persist edits into rate card
- English-first UI and PDF

Not in MVP:

- Catalog builder / dimensional formula studio
- Team price books
- Fine-tuned Whisper
- Market-price guesses by ZIP
- AR measuring
- Full payment-plan / tax engine beyond a simple note
- Full FSM (scheduling, dispatch, invoicing) beyond quote send
- Hebrew / RTL localization

## 14. Open questions for contractor interviews

Do not answer these from the armchair:

1. For a small service call, do you price in front of the customer or later?
2. For a multi-room remodel walk, do you want to send before you leave?
3. Would you upload old quotes on day one if it meant fewer blanks?
4. Is a lump “materials + travel” line acceptable on quote #1, or must materials be itemized?
5. When you say “straight swap outlet” or “laminate kitchen, 14 linear feet,” what is included — labor, material, both?
6. After 10 quotes, would you open a rate list to tidy names, or never?
7. Do you talk to the client while recording, or step aside for a private memo?

## 15. Success bar

- Time to first sent PDF: same session as signup, no catalog wizard
- Small job review: ~2 minutes
- Multi-room walk: he can send before leaving if Known rates cover enough lines
- Unknown lines on quote #1: expected; unknown lines on quote #20: rare for his common work
- Zero invented prices that he did not type, import, speak, or compute from his own rate
- He can explain the product in one sentence: walk the job, send a real quote, it remembers
