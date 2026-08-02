# GTM & Scale Design

**Product:** Sadhrana Bagh OS (working name) — chat-operated back office for physical, multi-unit service businesses
**Owner:** Ram Badrinathan · OmniDEL / KarmYog
**Written:** 1 August 2026
**Basis:** Code audit of this repo — 37 library modules, 22 API routes, 13 tables — against the live deployment

> This file is the durable reference for productising this codebase. It records what
> exists, which markets it fits, how to price it, and what must change architecturally
> before it can be sold to more than one customer. Update it rather than re-deriving it.

---

## Part 1 — Capability inventory (what is actually built)

Not a billing app. A **chat-operated back office**. Eight shipped modules:

| Module | Capability | Generic beyond hospitality? |
|---|---|---|
| GST billing / POS | Catalogue with HSN/SAC, CGST+SGST split, branded tax-invoice PDF, invoice series, versioned revisions with history, void, part-payment, UPI QR, public bill link, email, WhatsApp share as attached PDF | **Universal** — any Indian business issuing a GST invoice |
| Purchase capture (OCR) | Photograph a supplier invoice; vision model extracts vendor, date, totals and line items; itemised and editable in chat or web; GST split; becomes expense and optionally stock | **Universal** — highest value, least copied |
| Inventory | Locations/areas, items, value by area, purchase-to-stock allocation | Yes, for consumables-led businesses |
| Staff attendance | Supervisor punches team in/out at real times; present/half/absent/leave; hours; one row per person per day | **Universal** — any daily-wage workforce |
| Leads & quotations | Enquiry from pasted text or screenshot, B2B/B2C, multi-unit rate-card pricing, discount tiers, branded A4 estimate PDF | Yes, wherever price = unit x duration |
| Roles & scoping | Owner vs staff PINs, module visibility enforced in middleware, staff attribution on every document | Yes — required for delegation |
| Audit trail | Soft delete with who/when/why, owner-only restore, invoice version history | Yes — compliance backbone |
| Chat interface | Telegram bot: fuzzy commands, command menu, photo-intent gating, OCR ingestion, in-chat corrections | **The moat** |

### Differentiators, in order of defensibility

1. **A non-technical supervisor runs the whole back office from a chat app.** No laptop, no training, no app install.
2. **OCR removes data entry.** Photograph the paper that already exists. Incumbents assume someone will type.
3. **GST-compliant output without an accountant.** Correct tax split, HSN/SAC, invoice series, audit trail, revisions preserving history.

### Value proposition

> Run the whole back office from WhatsApp. Bills, purchases, stock and staff — photographed, not typed. GST-correct, no accountant, no training.

Deck framing: *the back office for businesses too small for an ERP and too real for spreadsheets.*

### The reusable spine

One commercial model sits under the hotel language:

**billable unit x duration x rate card**, plus extras, plus tax.

A villa-night is one instance. So is a desk-month, a banquet-day, a scaffolding-week, a treatment-hour. Anything matching this shape needs a new catalogue and rate card, not new code.

---

## Part 2 — Segments

### Tier 1 — Near-zero product change (sell first)

| Segment | Why it fits | Signal |
|---|---|---|
| Boutique villas, homestays, guest houses | Current product, proven daily | 50,000+ registered units, almost none on software |
| Farm stays / agri-tourism | Same shape plus F&B, cash-heavy | Fast-growing, subsidy-backed |
| **Wedding & event venues, banquet lawns** | Day rate + catering + heavy vendor purchasing + large daily crews | Exercises **all eight modules**; highest ticket |
| Wellness retreats, yoga ashrams | Package rates, F&B, therapist attendance | Adjacent to Yogazz / KarmYog Ashram |
| Serviced apartments | Night or month rate, housekeeping staff | Fragmented, owner-operated |
| Small resorts (<20 keys) | Same shape, more F&B volume | Where a PMS is unaffordable and overkill |

**Rank event venues first** — most modules used, highest per-invoice value. Boutique stays remain the proven wedge.

### Tier 2 — Light change (swap catalogue; add booking/appointments)

| Segment | Fit | Caution |
|---|---|---|
| Co-working / studio space | Very strong — a desk-month *is* a villa-night | Incumbents exist, none WhatsApp-first |
| Salons, spas | Service catalogue, staff, consumables | Crowded (Zenoti, Fresha) — win on chat + OCR only |
| Clinics, dental, diagnostic labs | Billing + consumables + staff | Patient-data handling needs care |
| Preschools, daycare, coaching | Fee invoices, staff attendance | Recurring fee **cycles** missing |
| Gyms, academies, sports turf | Membership + slot rental | Turf slot = rate card by slot |
| Catering companies | Event billing, purchase OCR, crew attendance | Strong fit, no dominant incumbent |

### Tier 3 — Adjacent, real work, possibly bigger prize

| Segment | Pull | Gap |
|---|---|---|
| Interior / civil contractors | Site expenses, material invoice OCR, daily labour — ~80% of their admin pain | Needs project/site as primary object, not guest |
| Landscaping & nurseries | **KarmYog Vatika is this customer** — plant catalogue, site labour, materials | Dogfood advantage |
| Facility management, housekeeping agencies | Multi-site attendance is their entire business | Needs per-site rosters + client billing from attendance |
| PG hostels, property management | Rent cycles, utilities, warden attendance | Needs recurring invoices |
| Equipment / furniture rental | Rate x days, deposits, damage | Needs return + deposit tracking |
| Small transport fleets | Trip billing, fuel OCR, driver attendance | Needs vehicle as billable unit |

**Second wedge worth testing cheaply:** attendance + purchase-OCR alone is saleable to contractors, FM agencies and caterers with no billing module at all.

### Tier 4 — Do not pursue

Retail with barcode/SKU velocity, pharmacy (batch and expiry regulated), manufacturing (BOM/routing), anything needing OTA channel management. Different data model, entrenched incumbents, no OCR advantage.

---

## Part 3 — Pricing

### Principles

1. **Per billable unit, not per seat.** Rooms, desks, chairs, sites. Staff seats unlimited — adoption depends on every worker being in the bot.
2. **Never per transaction.** Owners hide revenue from anything taxing each invoice; destroys trust and data quality.
3. **Charge for setup.** Catalogue, rate card, branded PDFs, bot, training is 4–8 hours of real work.
4. **Meter OCR** — it carries genuine marginal cost. Allowance plus packs.
5. **Land on daily pain, expand into monthly.** Billing and purchases are daily; leads, reports, payroll are expansion.

### Structure

| Plan | Fit | Price / month | Includes |
|---|---|---|---|
| Starter | ≤5 units | ₹1,499 | Billing + GST invoices, purchase OCR (60 scans), attendance, 1 property, unlimited staff |
| Growth | 6–20 units | ₹3,999 | + inventory, leads & estimates, reports, 300 scans |
| Multi-property | 21+ units / 2+ sites | ₹9,999 + ₹2,500 per extra property | + consolidated reporting, per-site roles, 1,000 scans |
| Setup (one-time) | all | ₹7,500–15,000 | Catalogue, rate card, branded PDFs, bot, 2 training sessions |
| OCR pack | overage | ₹499 / 250 scans | |

Module-only add-ons: **Attendance-only ₹799/mo** (contractors, FM), **Leads & Estimates ₹999/mo**.

### Rationale

- A villa taking ₹30,000 a booking recovers ₹1,499 on one correctly-raised invoice.
- ₹1,499 is below the level needing anyone's approval — the owner decides alone.
- Marginal cost per tenant today ≈ ₹150–400/mo; at 20 tenants on shared infrastructure ≈ **₹40–80**, dominated by OCR.
- Annual prepay at **ten months for twelve**.

### Alternative models

- **Consortium / white-label** — sell to a group (RARE India-style collection, homestay association) at ₹499–799 per property for 20+ properties, their branding. Lower ARPU, far lower CAC, one relationship. **Given the existing RARE India relationship, probably the fastest real revenue.**
- **Land free, charge at the invoice** — attendance free forever, pay on first GST invoice. Viral through staff, slower monetisation.
- **Services-led, product-funded** — until multi-tenancy exists: ₹25,000–50,000 per deployment + ₹2,500/mo support.

### Go-to-market sequence

**One proven property → two paid deployments → multi-tenant → consortium.** Not the reverse.

1. Prove Sadhrana for 60 days with Munish ji operating unassisted. Instrument what he uses versus ignores.
2. Two customers at services pricing: one **event venue** (all eight modules) and one **KarmYog Vatika site** (contractor-shaped). Two shapes, not two of the same.
3. Build multi-tenancy against those three real tenants, not a hypothesis.
4. Consortium play through RARE India — twenty properties in one conversation.

---

## Part 4 — Scale architecture

### Current state (verified by audit, 1 Aug 2026)

- **Single-tenant.** `lib/config.js` reads 19 environment variables: brand, GSTIN, legal name, rate card, units.
- One customer = one Vercel project + one Supabase project + one Telegram bot + manual env setup.
- **43 `getSupabase()` calls across 10 library files** — any of them can query anything.
- **Every RLS policy is `qual: true` for role `public`.** RLS provides zero isolation.
- Mitigating fact: the anon key is **not** in the browser bundle; all DB access is server-side in route handlers. So today's exposure is low — but what protects the data is an unleaked secret, not a policy. Acceptable at one tenant, indefensible at many.
- `next_bill_no()` is an atomic Postgres upsert — correct, but a single global counter.

### The four decisions

**1. Shared tables + `tenant_id`.** Not schema-per-tenant, not database-per-tenant. 13 tables, one migration path, one pool. Schema-per-tenant feels safer and becomes migration hell at ~30 tenants.

**2. Isolation enforced in a data layer, RLS as the second wall.** The crux. Make it impossible to write an unscoped query:

```js
// lib/db.js — the ONLY module permitted to import supabase
export function db(tenantId) {
  if (!tenantId) throw new Error("tenant required");
  const c = getSupabaseAdmin();
  return {
    from: (t) => ({
      select: (...a) => c.from(t).select(...a).eq("tenant_id", tenantId),
      insert: (rows) => c.from(t).insert(inject(rows, tenantId)),
      update: (p) => c.from(t).update(p).eq("tenant_id", tenantId),
      delete: () => c.from(t).delete().eq("tenant_id", tenantId),
    }),
  };
}
```

Add a lint rule: nothing outside `lib/db.js` may import `@/lib/supabase`. That constraint is what keeps tenant 12's bills out of tenant 3's list eighteen months later.

Add real RLS (`tenant_id = current_setting('app.tenant_id')::uuid`) as defence in depth — but do not *rely* on it, because the server uses the service-role key, which bypasses RLS.

**3. Config becomes rows.** A `tenants` table (brand, legal name, GSTIN, invoice prefix, GST rates, UPI, logo URL) plus a per-request cached loader. Environment variables are the hardest single blocker to self-serve onboarding.

**4. Generalise "villa" to "unit" now.** `RATE_CARD` is hardcoded villas with weekday/weekend/peak. Move to `rate_units` + `rate_prices`. This is what turns a hotel app into a platform. Two days now; a 20-file rename at 20 tenants.

### Phased plan (~5–6 weeks)

| Phase | Work | Effort |
|---|---|---|
| 0. Safety net | Cross-tenant leakage test suite: two tenants, assert every read/write is scoped. **Write this first** — the only proof the refactor is correct | 3 days |
| 1. Tenant column | `tenant_id` nullable on 13 tables → backfill Sadhrana → default → NOT NULL. Zero downtime | 3 days |
| 2. Data layer | `lib/db.js`, migrate 43 call sites, lint rule | 1 week |
| 3. Config as data | `tenants` table, cached loader, remove env reads, per-tenant `next_bill_no(tenant_id, series)` | 1 week |
| 4. Rate card as data | `rate_units` / `rate_prices`, villa→unit rename | 3 days |
| 5. One bot, many tenants | `tenant_chats` mapping chat_id → tenant_id, pairing-code onboarding, per-tenant allowlist | 4 days |
| 6. Storage + metering | Tenant-prefixed storage paths, `usage_events` for OCR counting and plan limits | 3 days |
| 7. Onboarding | Self-serve: brand, GSTIN, catalogue import, rate card, bot pairing | 1 week |

Phases 0–2 are the irreversible ones.

### Expensive-if-wrong details

- **Invoice numbering** must become `(tenant_id, series, year)` and stay atomic. Two staff raising bills simultaneously must never collide; GST sequence gaps are a filing problem.
- **Audit/deleted views** must be tenant-scoped too. They deliberately bypass normal filters, so they are exactly where cross-tenant leaks hide.
- **Storage paths** must be tenant-prefixed before the second tenant uploads anything.

### Do not build

- No billing/subscription engine until 10 paying customers. Invoice manually, take UPI.
- No per-tenant Vercel projects. One project, wildcard subdomain, tenant from host or session.
- No custom auth. Keep PINs, scope per tenant. Phone OTP only if a customer demands it.
- Do not migrate Sadhrana last — make it tenant #1 in phase 1 so later phases are exercised against real daily use.

### Known product risk to disclose in any sale

OCR is **assisted capture with a human check**, never automatic extraction. Live evidence: a purchase invoice in production reads `8X4-18mm, 3 x ₹8,640 = ₹25,920` against a ₹1,390 invoice total, plus garbled item names. The add-up warning catches exactly this and correction is one tap — but overselling accuracy is the fastest route to churn.

---

*Companion Google Doc (editable): Sadhrana Bagh OS — Segments, Value Proposition & Pricing, in the Document Review folder.*
