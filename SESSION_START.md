# Session start pack — Sadhrana Bagh billing / ops

**Use this file to begin a fresh Claude Code (or any AI) session.**  
**Product:** Sadhrana Bagh — villa stay POS, leads CRM, inventory, expenses, branded PDFs.

---

## 1. Active project (work here)

| Item | Value |
|------|--------|
| **Code root** | `E:\omnidel.ai\sadhrana-billing` |
| **Live URL** | https://sadhrana-billing.vercel.app |
| **Leads** | https://sadhrana-billing.vercel.app/leads |
| **Admin** | https://sadhrana-billing.vercel.app/admin |
| **Login** | https://sadhrana-billing.vercel.app/login |
| **Telegram bot** | **@BillposSbagh_Bot** |
| **GitHub** | (if linked — deploy via Vercel CLI from this folder) |
| **Vercel project** | `sadhrana-billing` (`prj_n92srQbREPdM6MHqxjQRhzonGkJh`) |
| **Supabase URL** | `https://bkpynofvujxocvzudjba.supabase.co` |
| **Supabase SQL editor** | https://supabase.com/dashboard/project/bkpynofvujxocvzudjba/sql/new |
| **Brand site** | https://www.sadhranabagh.com/ |
| **Legal** | VJ Development Ventures LLP |
| **GSTIN** | `06AAPFV9671F1ZJ` |
| **Phone** | +91 92209 02135 |
| **Email** | sadhranabagh@gmail.com |
| **Invoice prefix** | `VJD/RS` |
| **Admin PIN** | often `4826` (confirm Vercel `ADMIN_PIN` / `MANAGER_PIN`) |
| **Villas** | Bamboo House · Beri House · Kerala House · The Library · Entire property buyout |

### Do NOT mix with

| Path | Note |
|------|------|
| `E:\omnidel.ai\karmyog-vatika-billing` | KarmYog Newtown plants — separate product |
| `E:\omnidel.ai\karmyog-vatika-billing-fork` | Parked fork |
| `E:\omnidel.ai\rozail-vatika-billing` | Misnamed / ignore |

---

## 2. Paste this into Claude Code

```text
Continue Sadhrana Bagh billing + leads + ops.

ACTIVE only:
- Path: E:\omnidel.ai\sadhrana-billing
- Live: https://sadhrana-billing.vercel.app
- Bot: @BillposSbagh_Bot
- Supabase: https://bkpynofvujxocvzudjba.supabase.co
- SQL editor: https://supabase.com/dashboard/project/bkpynofvujxocvzudjba/sql/new
- Read first: E:\omnidel.ai\sadhrana-billing\SESSION_START.md

DO NOT touch unless I ask:
- karmyog-vatika-billing
- karmyog-vatika-billing-fork
- rozail-vatika-billing

Context: villa POS (F&B, bills, GST), Telegram bot, leads CRM with multi-villa rack estimates + discount + Estimate PDF, inventory/expenses/attendance, branded tax invoice + stay estimate PDFs (forest #1F4B43, terracotta #C2562A accent on totals). Estimate PDF on Vercel uses pdf-lib (Chromium HTML path flaky on serverless). Rate card: Domestic CP, 18% GST on stay (CGST 9% + SGST 9%). Website https://www.sadhranabagh.com/
```

---

## 3. Key files to open

### Config / brand
- `lib/config.js` — property, villas, **RATE_CARD**, `estimateStayDeal`, night bands
- `lib/brand-pdf.js` — palette, WinAnsi helper, booking footer, logo load
- `SESSION_START.md` — this file
- `.env.example` (if present) / Vercel env for secrets

### Leads / estimates
- `lib/leads.js` — upsert, list, delete; optional columns strip on missing migration
- `lib/lead-estimate.js` — rack estimate, multi-villa, discount → quoted
- `lib/lead-parse-telegram.js` — parse paste / OCR text for /lead
- `lib/estimate-html.js` — A4 HTML template (design source of truth)
- `lib/estimate-pdf.js` — **entry**: HTML+Chrome local, **pdf-lib on Vercel**
- `lib/estimate-pdf-lib.js` — production PDF generator (reliable)
- `lib/html-to-pdf.js` — puppeteer-core + @sparticuz/chromium (local / optional)
- `app/leads/page.js` — pipeline UI, recompute, discount chips, Estimate PDF button
- `app/api/leads/route.js` — GET/POST/DELETE
- `app/api/leads/[id]/estimate/route.js` — PDF download (`maxDuration` 60s)

### Bills / Telegram / ops
- `lib/telegram-handler.js` — bot: bills, /lead wizard (✓ multi-room), purchase OCR
- `lib/telegram.js` — keyboards, send helpers, **leadStayKeyboard** multi-toggle
- `lib/invoice-pdf.js` — branded tax invoice
- `lib/bills.js` · `lib/ocr.js` · `lib/ops.js` (if present)
- `app/admin/page.js` · `app/bills/new/page.js` · `app/inventory/page.js` etc.

### SQL (already run on prod Supabase if user completed)
- `supabase/SETUP_LEAD_DEAL.sql` — villa, dates, deal_value, segment, adults/kids
- `supabase/SETUP_LEAD_DISCOUNT.sql` — discount_pct, discount_inr, quoted_value_inr
- `supabase/SETUP_OPS.sql` — inventory/expenses/attendance (ops)
- `supabase/SETUP_LEADS_B2B.sql` — if used

### Assets
- `public/logo.png`
- `public/brand/hero-aerial.jpg` — estimate hero
- `public/brand/hero-lounge.png`
- `docs/stay-estimate-anmol-wahi.html` — static design reference (not the live path)

### Deploy config
- `next.config.js` — chromium externals / tracing (HTML engine)
- `vercel.json` — estimate route maxDuration 60

---

## 4. Live product links

| What | URL |
|------|-----|
| App home | https://sadhrana-billing.vercel.app |
| Leads pipeline | https://sadhrana-billing.vercel.app/leads |
| Admin | https://sadhrana-billing.vercel.app/admin |
| New bill | https://sadhrana-billing.vercel.app/bills/new |
| Inventory | https://sadhrana-billing.vercel.app/inventory |
| Reports | https://sadhrana-billing.vercel.app/reports |
| Website | https://www.sadhranabagh.com/ |
| Supabase SQL | https://supabase.com/dashboard/project/bkpynofvujxocvzudjba/sql/new |

---

## 5. Recent decisions / state (as of 2026-07-31+)

1. **Leads CRM**
   - Telegram `/lead`: paste text or photo → B2B/B2C → multi-select villas with **✓ / ○** (buttons do not type into chat).
   - Rooms detected from paste (e.g. Library & Bamboo) are pre-selected.
   - Web card: Recompute estimate, discount chips (0/5/10/15/20%), Estimate PDF.
   - **Estimated rack** vs **quoted after discount** (not “final invoice value”).

2. **Estimate PDF**
   - User wants boutique branded A4 (not plain vanilla).
   - HTML template exists (`estimate-html.js` / `docs/stay-estimate-anmol-wahi.html`).
   - **Vercel production uses `buildEstimatePdfLib`** — Chromium/`@sparticuz/chromium` failed packaging (`bin` directory missing after Next bundle). Do not re-enable HTML-on-Vercel without fixing NFT includes thoroughly and testing.
   - Local can set `ESTIMATE_PDF_ENGINE=html` for Chrome HTML→PDF.
   - Brand colours: forest `#1F4B43`, terracotta `#C2562A` (totals only in HTML design), ivory `#FBF8F2`, mist `#E7EFEC`.
   - Footer always: book CTA, phone, email, website.

3. **Tax invoice PDF** (`invoice-pdf.js`)
   - Same brand system + booking footer; GST legal blocks retained.

4. **Rate card (stay)**
   - Domestic CP, breakfast included; weekday/weekend/peak per villa; **18% GST** on stay (CGST 9% + SGST 9%) in estimate logic.
   - Multi-villa = sum of each villa’s night rates (not a single shared night line only).

5. **SQL**
   - User successfully ran deal + discount column alters on Supabase project `bkpynofvujxocvzudjba`.

6. **Scope**
   - Stay on **this** repo/deploy. No new Vercel project unless asked.

---

## 6. Commands

```powershell
cd E:\omnidel.ai\sadhrana-billing
npm install
npm run dev
# production deploy (only when user approves):
npx vercel --prod
```

### Env (Vercel production — do not commit secrets)
Typical keys: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_IDS`, `ADMIN_PIN`, `MANAGER_PIN`, `OPENROUTER_API_KEY`, `APP_URL`, brand `NEXT_PUBLIC_*` fields, optional `ESTIMATE_PDF_ENGINE=pdflib|html`.

---

## 7. Known pitfalls

| Issue | Guidance |
|-------|----------|
| Estimate PDF Chromium error on Vercel | Expected if HTML engine forced; use pdf-lib path (default when `VERCEL` set) |
| WinAnsi / “cannot encode →” | Never put Unicode arrows/rupee in pdf-lib text; use `winAnsi()` / `Rs` / `->` |
| Lead with rooms only in notes | Tap **Recompute estimate** after SQL columns exist |
| Paste English headings into Supabase SQL | Only pure SQL — no markdown |
| Mixing KarmYog code/env | Never — different brand, DB, bot |

---

## 8. Quality bar (from property owner feedback)

- Estimates must feel **Sadhrana** (photography, forest/terracotta, website + book contacts), not generic POS.
- Estimate ≠ tax invoice; label clearly.
- Multi-villa enquiries must show **both rooms** and combined rack value.
- Discount is commercial / fair % on backend; client estimate shows quoted after discount when set.

---

*Handover for Claude Code · Sadhrana Bagh only · Updated after estimate PDF production fix.*
