# First Principles — a back office for the 1-to-4-person property

**Written:** 5 August 2026
**Basis:** Eight months of daily production use at Sadhrana Bagh (4 villas, 9 rooms, 8 staff, one supervisor), 41 library modules, ~70 unit tests, and every bug listed below reaching a real user before it was fixed.
**Companion docs:** `docs/GTM_AND_SCALE.md` (market, pricing, multi-tenancy) · `docs/PROPERTY_OPS.md` (this property's specifics)

> This file is the **transferable part**. Not the feature list — the laws. If you rebuild
> this for another property and follow nothing else here, follow Part 2.
>
> Everything below was learned by getting it wrong in production first. Where a rule has a
> named incident, it is because a weaker version of that rule shipped and cost someone a day.

---

## Part 1 — Who this is for, stated honestly

**The operator is one person who is not an accountant, not a computer user, and is holding a phone in one hand.**

At Sadhrana Bagh that person is Munish. He walks the property, buys the vegetables, marks who turned up, and hands the guest a bill at checkout. He is the entire back office. There is no front desk, no accounts department, no IT.

This is the actual shape of the market:

| | Small hotel software assumes | Reality at 1–4 people |
|---|---|---|
| Roles | Front desk, F&B, accounts, manager | **One person, all roles** |
| Training | A day of onboarding | **Zero. It works or it doesn't.** |
| Device | Desktop at a counter | **A phone, standing up, one-handed** |
| Data entry | Typed into fields | **A photograph of a piece of paper** |
| Accounting | In-house or integrated | **A part-time accountant paid per month** |
| Failure cost | A support ticket | **The guest is at the gate, leaving** |

The competitor is not another app. **The competitor is WhatsApp plus a paper voucher book plus the accountant.** That stack has no license fee, works during a power cut, and is already trusted. Anything that is *more* work than the paper book loses, no matter what it can do.

### The one sentence that defines the product

> Replace the accountant's monthly invoice-typing and the owner's monthly pivot table — without asking the operator to learn anything.

Not "manage your property". Not "grow your revenue". Two specific, expensive, recurring chores.

### Where this fits beyond villas

The pattern transfers wherever a **tiny team**, **physical premises**, and **statutory invoices** meet:

homestays and Airbnb hosts with staff · boutique guesthouses · farm stays · standalone restaurants and cafés · salons and spas · clinics · tuition centres · small nurseries and garden centres · event and catering operators · workshops and repair shops.

What must change per vertical: the catalogue, the tax rates and HSN/SAC codes, and the words on the buttons. What does not change: everything in Part 2.

---

## Part 2 — The design laws

These are ordered by how much damage their absence caused.

### Law 1 — The paper is the source of truth. The entry is a transcription of it.

Every number in the system came off a piece of paper someone photographed. **Store the photograph, attached to the entry, and show it next to the numbers.**

An entry without its paper is unverifiable at audit and unarguable with a guest. A system that stores only the transcription has quietly thrown away its own evidence.

Three sub-rules, each bought with a bug:

- **Show the image, not a link to it.** A grey "Invoice file" text link that disappears when the row expands is functionally the same as not storing it. The owner looked, saw nothing, and concluded the feature was broken. Render a thumbnail.
- **Say so, loudly, when the paper did NOT save.** For over a month every purchase photo was rejected by storage (the bucket allowed `application/pdf` only, so `image/jpeg` returned 415) and the uploader swallowed the error and returned `{url: null}`. The expense saved cleanly and looked identical to one with evidence behind it. **Zero of five entries had a photo and nobody could tell.** Silence on failure is the bug, not the 415.
- **An entry with no paper must look wrong.** Red text, a dashed box, a count on the month view: *"1 of 2 have the paper on file."*

> **Law 1a — never swallow a storage or write failure.** If it did not save, the operator must be told in the same message, with the reason. `console.error` is not telling anyone.

### Law 2 — Two supplies at two tax rates are two businesses. Never add them up.

Rooms are SAC 997212 at 18%. Restaurant is SAC 996331 at 5%. A single "revenue" number spanning both is wrong for tax filing and useful for nothing else.

Keep them apart **in the database** (`invoice_kind`), **in the numbering** (separate series), **in the list** (a badge on every row), **in the totals** (two cards, never one sum), and **in the month report** (that split *is* the GST return).

The owner's own words, which are the requirement: *"Otherwise it gets all confused and jumbled up."*

### Law 3 — The rate card is a starting point. The operator sets the price.

Real bookings are discounted, packaged, or agreed on the phone. A system that can only charge rack rate will be abandoned on the first negotiated booking.

Accept an agreed per-night rate **or** an agreed total for the stay. Then:

- **Still compute the rack rate and show it beside what is being charged.** The discount goes on the record instead of vanishing. A ₹47,700 concession should be visible to the owner without an investigation.
- **Price server-side from the inputs.** The browser posts the rate and the dates; it never posts a finished total.
- **Ignore rubbish rather than obeying it.** Zero, negative and non-numeric overrides fall back to the rate card. An override must never be able to zero an invoice.

### Law 4 — Price per night, not nights × one rate.

A Thursday-to-Sunday stay is one weekday night and two weekend nights. At Sadhrana Bagh that is ₹2,27,700, not 3 × ₹69,300. Iterate the nights, classify each one (weekday / weekend / peak), and price it.

Corollaries that all needed tests: check-out day is not a night; same-day check-out is refused; reversed dates are refused rather than producing negative nights; `2026-02-31` is refused rather than silently rolling into March.

### Law 5 — The line description belongs to the accountant, not to the designer.

The invoice line reads `SALE OF RENTAL SERVICES ON IMMOVABLE PROPERTY`. It is ugly. It is also the ledger wording in the accountant's Tally, and the entire point of the invoice is that it reconciles without him retyping it.

**Copy the wording verbatim, pin it as a constant, and write down that it must not be improved.** "Villa stay" reads better and breaks the only thing that mattered. Human-readable detail belongs in the notes field.

The same discipline applies to the entity block: legal name, GSTIN, PAN, CIN, state code, bank details and jurisdiction line are copied from a real issued invoice, not composed.

### Law 6 — Validate an identifier by its own checksum, not its length.

A customer's GSTIN is how they claim input tax credit. A wrong one doesn't error — it silently fails their claim weeks later, and they come back asking for a revised invoice.

`06AAPFV9671F1ZK` is fifteen characters, matches the pattern, and is wrong. Implement the government check digit and refuse it *before* it reaches a printed invoice. Same principle for any identifier the customer will act on downstream.

Two more rules around it:
- **Derive what you can from the identifier.** The buyer's state comes out of the GSTIN, so a typed state can never contradict the number printed beside it.
- **Empty is valid.** Most guests are individuals. A B2C invoice with no GSTIN is perfectly legal — don't force a field that shouldn't exist.

### Law 7 — Get the tax treatment right once, in one place, with the reason written down.

For accommodation (place of supply = where the property is, §12(3)) and restaurant service (performed on the premises, §12(4)), the place of supply is **always the property's own state**. So an out-of-state buyer is still CGST + SGST, and **never IGST**.

The obvious-looking implementation — "buyer in another state → IGST" — would put the wrong tax on every corporate booking. The accountant's own Delhi-buyer invoice, charging CGST 9% + SGST 9% with *Place of Supply: Haryana*, is the proof. That reasoning lives in a commented function, not in someone's memory.

### Law 8 — The document the customer receives must agree with the database. Verify by reading it.

The PDF computed tax from a hardcoded 2.5% property constant. A room invoice therefore printed **₹11,385 GST and a grand total of ₹2,39,085 while the database held ₹40,986 and ₹2,68,686.**

The build passed. The screen was right. Only the paper going to the customer was wrong.

- Derive every printed figure from the same per-line data the totals came from.
- Group the HSN/SAC summary from the lines' own codes — a shared default printed the restaurant SAC on room invoices.
- **Open the generated PDF and read it.** Not the API response, not the screen — the artifact. Three of this system's worst bugs were only visible in the rendered document: the wrong tax rate, a truncated ledger line (`...IMMOVABLE PROP...`), and an overlapping header (`TAX INVOICESadhrana Bagh`) caused by guessing text width from character count instead of measuring it.

### Law 9 — Show the money the guest actually owes.

An invoice must carry **advance received** and **balance due**, or the guest's first question is unanswerable from the document in their hand. Paid in full says so. Overpayment is marked refundable, never quietly absorbed. And the payment status in the header cannot say "Due on presentation" on an invoice that also shows a balance — the document must not contradict itself.

### Law 10 — An issued number is spent forever.

Soft-deleting an invoice does **not** free its number; the unique index still holds it.

Rolling a counter back over soft-deleted rows makes the next insert fail with `duplicate key value violates unique constraint`, and the operator loses the invoice they were raising — with the guest standing there. Hit in production.

- The allocator **skips numbers already present** (soft-deleted included) rather than failing, with a bounded retry.
- Separate sequence per series, per financial year, in local time.
- Test artifacts get **hard-deleted**, so the first real invoice is `001` with no gap. Anything a customer has seen is soft-deleted forever.

### Law 11 — Unmarked means absent. Never invent a record.

An early attendance screen pre-filled every person as present 09:00–18:00, which fabricated attendance for people who never came — and payroll would have paid it.

- Absence is the default; presence requires an affirmative act.
- Reversed or garbage times give **0 hours**, never negative.
- Absent and leave store no times at all. A site that doesn't measure hours must not accumulate times that *look* measured; someone will eventually sum them.
- One row per person per day, enforced by a unique index, so re-marking is an UPDATE and hours can't double-count.
- Case-insensitive unique names, so a seed can't duplicate a person and a rename can't leave both spellings on the board (a real *Gumesh/Gunesh* incident).
- Every mark is attributed to whoever made it.

### Law 12 — One deployment per site. Never share a database.

On 2026-08-04 a seed script aimed at a different property ran against this one, in a single transaction: **three people who work somewhere else appeared on a live attendance board with working clock-in buttons, and nine plant SKUs landed in a restaurant menu.**

- One Supabase project and one bot per property. Confirm the project ref before any write.
- Idempotent seeds must omit columns they don't own — never send `NULL` over real data.
- Deactivate (`active = false`); do not delete.
- **Never add a staff row on your own initiative.** Not to complete a roster, not because a name appeared in a message. Ask.

### Law 13 — Name the action after what it produces.

The operator picks from a phone screen while doing something else. `+ Create tax invoice` is meaningless when there are three kinds of document.

**🍽️ F&B BILL — food & drink** · **🛏️ ROOM BILL — nights stayed** · **📦 PURCHASE / EXPENSE — money we spent**

Each name says what it is; each subtitle says what it makes and, where it matters, what it is **not** — the purchase card says *"not a guest invoice"*, because that exact confusion happened. The page he lands on repeats the name, confirming he picked right. Money **in** and money **out** are labelled as such.

### Law 14 — Never make the operator retype what a photograph already says.

Photo → OCR → **editable draft** → confirm. The draft is the point: OCR misreads handwriting, so corrections must be possible in the same place the photo was sent (`3 x 4`, `3 = 385`, `del 3`, `+ Item | qty | rate`), not in a back office the operator can't reach.

- **Cross-check the total written on the paper** against the sum of the lines and warn on a mismatch. This is what catches a ₹20,000 OCR shortfall.
- **Never invent tax.** An 18% default once turned a ₹5,350 slip into ₹6,313. Daily purchases from local vendors carry no GST; tax exists only if it is written on the paper.
- **Never argue with the format of the paper.** A handwritten voucher with no vendor, no GSTIN and no rates is still a purchase. Requiring "a supplier invoice with vendor details and itemised lines" refused a real ₹22,029 spend with the word **VOUCHER** printed at the top.
- **A lump sum must survive.** Items named against one total with no rates collapse into a single line *holding* that total — otherwise every downstream recomputation from line amounts turns the voucher into ₹0.
- **A wrong turn must be recoverable in one tap.** When the operator picks the wrong document type, return the picker over the same photo instead of wedging.

### Law 15 — Choose the model for the job, and let the vendor be wrong.

Handwritten Indian numerals in ballpoint on a ruled voucher, photographed at an angle, is a hard vision task. The cheap tier misreads digits, and a misread digit is money.

Pin a high-resolution vision tier per provider, guard a vendor-prefixed model name from reaching the wrong API, and treat OCR output as **a draft for a human**, never as a fact.

### Law 16 — Chat is the interface; the web app is for the owner.

The operator lives in WhatsApp/Telegram. Every daily action — bill, purchase, attendance — must complete there. The web app is for the owner's month-end and the things a small screen can't do.

- **A slash command always beats an open draft.** `/attendance` typed mid-edit was once swallowed and answered *"didn't understand that"* — and `/cancel`, the documented escape, was swallowed too.
- **Gate on explicit commands**, or ambient group chatter generates junk entries.
- **Forgive typos** on commands (`/attendence`, `/ attendance`, `/Attendance`), but **never auto-run a money command** from a fuzzy match — suggest it.
- **A tap on a stale board refuses** rather than acting on the wrong person.
- Markdown that fails to parse must fall back to plain text, or the operator reads literal asterisks.

### Law 17 — One person, full permissions. Roles protect data, not people.

A four-person business has no separation of duties to enforce. Locking the only operator out of correcting his own mistake is not a safeguard.

Give edit and delete on everything he creates, and make delete a **soft delete with an audit trail** (`deleted_at`, `deleted_by`, `delete_reason`, restorable by the owner). Recoverability is the real control; permission gates are theatre at this size.

Role separation should protect *categories of information* — total revenue, margins, other people's pay — not ordinary work. And a role-gated page whose data API is also gated must be gated **consistently**: a page that renders and then 403s every figure on it is worse than a redirect.

### Law 18 — Compute dates in the property's timezone, not the server's.

A UTC server rolls the day at 05:30 local, so a late-evening bill lands on tomorrow and the day-end report is wrong. Financial year runs 1 April to 31 March. Derive month ends from *day 0 of the next month* rather than a lookup table, and February takes care of itself.

### Law 19 — Test the money, in a pure module, with the incident in the test name.

~70 assertions, no database, no network. What earns a test: tax computation, per-night pricing, override handling, date and identifier validation, day-building, invoice numbering.

Write the test so the next person sees the incident:

```
ok   priced per night = 227700, not 3 x weekday
ok   and is NOT nights x one rate
ok   UNMARKED defaults to absent, not present
ok   reversed times = 0, never negative
ok   timed mode: present without a clock is NOT trusted as present
ok   negative extras never reduce the bill
ok   out-of-state buyer is still CGST+SGST
```

**A green build is not verification.** Every one of the worst bugs here compiled: an undefined runtime value, a missing import on a page, a hardcoded tax constant, a swallowed 415. Verification is reading the artifact and querying the database.

---

## Part 3 — What is property-specific vs product

Building this for the next customer, the split is roughly 80/20.

| Reusable as-is | Per-customer configuration |
|---|---|
| GST engine, CGST/SGST split, HSN/SAC summary | Tax rates and SAC codes for their supplies |
| Branded invoice PDF (advance, balance, words, bank block) | Legal name, GSTIN, PAN, CIN, bank, logo, jurisdiction |
| GSTIN validation with check digit | — |
| Invoice numbering, series, skip-taken, FY | Series prefixes |
| Photo → OCR → editable draft → confirm | Prompt wording for their document types |
| Source-photo evidence and storage | Storage bucket |
| Attendance (both modes) and month rollup | Roster, shift, timezone |
| Purchases, categories, soft delete, audit trail | Expense categories |
| Chat command router, fuzzy match, drafts | Bot token, allowlist |
| Month-end report and exports | — |
| Role scoping and PIN auth | PINs |
| Per-night pricing engine | The rate card |
| Action naming pattern | The words on the buttons |

**Not yet built, and needed before selling to more than one customer:** multi-tenancy (`tenant_id` + RLS + a scoped data-access layer — see `docs/GTM_AND_SCALE.md`), self-serve onboarding, per-tenant branding upload, subscription billing, and a rate-card editor in the UI rather than in `lib/config.js`.

---

## Part 4 — The build discipline that produced this

1. **Read the customer's real documents before writing code.** Every correct detail here — the ledger wording, the SAC codes, the intra-state treatment, the bank block — came from seven PDFs the accountant had already issued. None of it could have been guessed, and a guess would have looked plausible.
2. **Reproduce a real historical document exactly, and check it to the rupee.** Invoice `VJD/2026-27/019` reproduced at ₹1,22,400 taxable / ₹22,032 GST / ₹1,44,432 total. That single test validated the pricing engine, the tax treatment, the GSTIN handling and the PDF at once.
3. **Test as the actual user, on the actual role.** A room invoice issued on the *staff* PIN proved Munish can do it. Testing as admin would have proved nothing about him.
4. **Read the artifact.** Fetch the PDF, open it, look at it. Query the table. A 200 response is not evidence.
5. **Clean up your own test data in the same session**, and roll the counters back correctly — remembering Law 10.
6. **Record the reason beside the code.** Every non-obvious rule in this system has a comment naming the incident. That is why this document could be written at all.
7. **Ask production-or-preview before every deploy.** Never assume, in either direction.

---

## The two-line summary

**Meet the operator where he already is — a phone, a photograph, a chat thread — and never make him retype what the paper already says.**

**Then make sure the document that leaves the building agrees with the database, and that the paper behind every number is still on file.**
