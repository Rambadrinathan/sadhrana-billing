# BillBanaoPay — Prospect Marketing & Pricing Brief  
**By OmniDEL.ai** · Product: **BillBanaoPay** · Domain: billbanaoppay.com  

**Version:** 3.0 · 2026-07-30  
**Audience:** Prospective SME / hospitality / services customers  
**Voice:** Owner-to-owner. Lead with **benefit**, then name the **feature**.  

**Demo brand on marketing site only:** Cedar Nook Homestay (fictional).  
**Never use real client names** (e.g. Sadhrana) on the public marketing site.

---

## 0. Brand hierarchy

| Layer | Name | Role |
|-------|------|------|
| Company | **OmniDEL.ai** | Who builds and supports it |
| Product | **BillBanaoPay** | What the customer buys |
| Domain | **billbanaoppay.com** | Public site |

Footer: *BillBanaoPay by OmniDEL.ai*

---

## 1. One-line pitch (benefit first)

**BillBanaoPay** helps you **get paid without arguments** — staff bill from Telegram or a photo of a pad; you get a formal invoice, GST when you need it, a clear trail of changes, and owner reports for collections and your CA.

---

## 2. Who this is for

Small teams that:

- Bill at the counter or on-site (phone in hand)  
- Still use paper pads, WhatsApp notes, or Excel  
- Want invoices that look **official** so guests/customers pay cleanly  
- Need GST on some bills and off on others  
- Have 1–10 people creating bills across shifts  

**Illustrative (not industry-locked):** boutique stay extras desk, café takeaway, salon, workshop, tuition, rental desk, kirana + services.

---

## 3. Problem (customer language)

> “When the bill looks casual, people negotiate. When it’s neat and formal, they pay. Software is either too heavy or too expensive for how we actually work.”

| Pain | What it costs you |
|------|-------------------|
| Handwritten / WhatsApp bills | No sanctity; disputes; weak proof |
| Rates written wrong | Margin leakage; staff guesswork |
| GST always on or always off | Wrong tax treatment; CA friction |
| Edits with no history | “Who changed this?” → trust breaks |
| No day-end or Excel for owner | You fly blind on cash vs pending |
| Different people on shifts | Can’t see who raised which bill |

---

## 4. Communication rule (always)

For every capability, write in this order:

1. **Benefit** — what the owner gains (money, time, trust, control)  
2. **Feature** — what the product does  
3. **How** — Telegram / web / photo, one line  

Never lead with jargon (“versioning”, “OCR”, “multi-sheet xlsx”) without the benefit first.

---

## 5. Benefits → features (prospect-facing)

### A. Get paid without looking amateur  
**Benefit:** Guests take the bill seriously; fewer negotiations.  
**Feature:** Professional tax-style PDF (logo, GSTIN, line items, amount in words, paid stamp).  
**How:** Confirm in Telegram or web → PDF stored + shareable link.

### B. Bill from the phone your staff already use  
**Benefit:** No new desktop software; training in one session.  
**Feature:** Telegram bot (type a bill) **or** photo of handwritten slip (AI OCR) **or** web checkout.  
**How:** Allowlisted phones only; same menu rates on all three.

### C. Prices stay consistent — even when staff are in a hurry  
**Benefit:** Protect margin; stop “special rates” by accident.  
**Feature:** Official **menu / price list**; matched lines lock to catalog rates.  
**How:** Owner edits **Menu** on the portal; Telegram `/menu` and web bill use **live** rates.

### D. GST only when it belongs on that bill  
**Benefit:** Correct invoices for exempt vs taxable sales.  
**Feature:** **GST ON / OFF per invoice** (when ON: 5% as 2.5% CGST + 2.5% SGST).  
**How:** Toggle on draft (Telegram or web) before confirm.

### E. Know who raised the bill on which shift  
**Benefit:** Accountability across Ravi / Vijay / temp staff.  
**Feature:** **Staff roster** (name + phone); required picker on every bill; filter invoices by staff.  
**How:** Owner → **Staff**. New person? Choose **Others** and type their name (web + Telegram).

### F. Never wonder “how did this invoice get adjusted?”  
**Benefit:** Trust with guests and CA when numbers change.  
**Feature:** **Version history** — each edit archives prior lines, totals, and PDF.  
**How:** Staff/owner open **Version history** on any invoice; Telegram `/edit` + history.

### G. See money in vs money still due  
**Benefit:** Day-to-day control of collections.  
**Feature:** Mark **paid** (UPI / cash / card), **partial / advance**, UPI QR when configured.  
**How:** Bill screen + owner dashboard stats (collected vs pending).

### H. Close the day without a spreadsheet scramble  
**Benefit:** Night audit / till match in minutes.  
**Feature:** **Day-end close** — today’s billed, collected, pending, split by UPI/cash/card.  
**How:** Owner → **Day-end** → print.

### I. Hand your CA clean numbers  
**Benefit:** Month-end without digging through WhatsApp.  
**Feature:** **Reports** + **branded multi-sheet Excel** (summary, invoices, line items, by customer; final billed + GST).  
**How:** Owner → **Reports** → date range → Download Excel.

### J. One system for staff and owner  
**Benefit:** Field team bills; you oversee.  
**Feature:** Separate **Staff** vs **Owner** PIN; logo-branded portal.  
**How:** Login roles; owner gets Menu, Staff, Reports, Day-end, Excel.

### K. Share the bill the way India actually pays  
**Benefit:** Guest gets the bill on WhatsApp; optional email.  
**Feature:** WhatsApp share (PDF + link), email invoice (mail app or Resend).  
**How:** One tap from bill page.

### L. Formal GST detail on lines  
**Benefit:** Invoice looks tax-ready, not like a notepad.  
**Feature:** **HSN/SAC** on lines (from menu or default).  
**How:** Set on Menu items; appears on PDF and portal.

---

## 6. Demo story (fictional only)

**Cedar Nook Homestay** · Staff “Rina” · Owner dashboard  

1. Telegram text bill + GST toggle  
2. Staff name picker (or Others)  
3. Confirm → PDF  
4. Owner: collected / pending, version history, Excel  

Screenshots: use Cedar Nook framing only.

---

## 7. Unit economics & cost model (internal → informs price)

### 7.1 Volume anchor (hospitality extras example)

Illustrative property: ~**₹30 lakh / year** F&B-style extras.  
If average bill ~**₹10,000** → ~**300 invoices / year** ≈ **25 / month**.

| Volume scenario | Invoices / year | Invoices / month (avg) |
|-----------------|-----------------|------------------------|
| Small extras desk | **300** | ~25 |
| Busy single outlet | **1,000** | ~80–85 |
| High volume / multi-desk | **4,000+** | ~330+ |

### 7.2 What each invoice costs *us* (order of magnitude)

| Cost component | Notes | Est. at 25 inv/mo | Est. at 100 inv/mo | Est. at 350 inv/mo |
|----------------|-------|-------------------|--------------------|--------------------|
| **Vercel** hosting | Share Pro or Hobby; serverless | ₹50–200 / mo / customer* | same* | ₹200–500* |
| **Supabase** DB + storage | Free tier often enough; Pro if heavy | ₹0–150 | ₹0–200 | ₹150–400 |
| **OCR tokens** (OpenRouter vision) | Only when staff send a **photo**; ~20–40% of bills | ₹30–150 | ₹120–600 | ₹400–2,000 |
| **Text bills** | No vision LLM; parse + PDF (cpu) | ~₹0 | ~₹0 | ~₹0 |
| **PDF / storage** | pdf-lib + object storage | negligible | low | low |
| **Support / ops** (OmniDEL) | Human time | dominant real cost | — | — |

\*Shared multi-tenant amortisation. Single-tenant dedicated stack is higher; still small vs subscription.

**OCR assumption:** Mid-tier vision ~₹1–5 per photo (varies by model).  
Premium vision ~₹5–15 per photo.  
Standard plan uses efficient model; higher plans allow better OCR accuracy models.

**Illustrative pure variable tech cost (order of magnitude):**

| Plan volume | Tech COGS / month | Tech COGS / quarter |
|-------------|-------------------|---------------------|
| ~25 inv/mo (300/yr), 30% OCR | **₹100–400** | **₹300–1,200** |
| ~80–100 inv/mo, 30% OCR | **₹300–1,200** | **₹900–3,600** |
| ~300+ inv/mo, 40% OCR, premium model | **₹1,500–5,000+** | **₹4,500–15,000+** |

**Conclusion:** At SME volumes (25–100 inv/mo), infrastructure + tokens are **well under 15–25% of list price**. Price is driven by **product value** (collections discipline, staff control, CA-ready books) and **support**, not pure token burn. Higher tiers buy **higher OCR quality + higher invoice caps + priority support**.

### 7.3 Margin sketch (list price before GST)

| Plan | Price / quarter (excl. GST) | Annual | At 25 inv/mo tech COGS/qtr | Rough gross after tech |
|------|----------------------------|--------|---------------------------|-------------------------|
| Starter | ₹16,000 | ₹64,000 | ~₹500–1,500 | Strong |
| Growth | ₹24,000 | ₹96,000 | ~₹1,000–3,500 | Strong |
| Pro | ₹40,000 | ₹1,60,000 | ~₹3,000–12,000 | Healthy if volume high |

---

## 8. Public pricing (3 plans)

All prices **excluding GST**. GST extra as applicable (e.g. 18%).  
Billing: **quarterly in advance**.  
Invoice caps are **hard soft-limits** for fair use; overage sold as top-up or plan upgrade.

### Plan comparison

| | **Starter** | **Growth** | **Pro** |
|--|-------------|------------|---------|
| **Price** | **₹16,000 / quarter** | **₹24,000 / quarter** | **₹40,000 / quarter** |
| **≈ per month** | ≈₹5,333 | ₹8,000 | ≈₹13,333 |
| **Invoice allowance** | Up to **80 invoices / month** | Up to **250 invoices / month** | **1,000+ invoices / month** class |
| **Best for** | ~25–80 bills/mo (e.g. ~300/year extras desk) | Busy single outlet | High volume / multi-desk |
| **OCR model** | Standard vision (efficient) | Enhanced vision (better handwriting) | Premium vision + priority queue |
| **Telegram + web + photo** | ✓ | ✓ | ✓ |
| **GST on/off, menu lock, PDF storage** | ✓ | ✓ | ✓ |
| **Staff roster + Others** | ✓ | ✓ | ✓ |
| **Version history** | ✓ | ✓ | ✓ |
| **Reports + Excel** | ✓ | ✓ | ✓ |
| **Day-end close** | ✓ | ✓ | ✓ |
| **Branded logo on portal & PDF** | ✓ | ✓ | ✓ |
| **Support** | Business hours (chat/email) | Priority business hours | Priority + setup hand-holding |
| **Multi-outlet** | — | Optional add-on | Included / preferred |

**Example:** Property with **~300 invoices/year** (~25/mo) → **Starter ₹16,000/qtr** (80/mo cap with headroom).

**Example:** Approaching **1,000–3,000 invoices/year** → **Growth ₹24,000/qtr**.

**Example:** **4,000+ invoices/year** or heavy photo billing → **Pro ₹40,000/qtr**.

### What is *not* included (honest)

- Full accounting / Tally replacement  
- WhatsApp Business API bot (Telegram today; WA roadmap)  
- Payment gateway settlement (UPI QR link is pay-assist, not escrow)  

---

## 9. Website structure (prospect site)

1. **Home** — hero benefit, 3-step how it works, benefit grid, pricing teaser, CTA  
2. **How it works**  
3. **Features** (benefit → feature cards)  
4. **Pricing** (3 tiers above)  
5. **FAQ**  
6. **Sample invoice** (Cedar Nook)  
7. **Contact / Book demo**  

### Hero copy

**H1:** Professional invoices from a chat — so you get paid without the argument.  
**Sub:** BillBanaoPay by OmniDEL.ai. Telegram or a photo of the pad → formal PDF, GST when you need it, staff accountability, and Excel reports for the owner.  
**CTA primary:** Book a 15-minute demo  
**CTA secondary:** See pricing  

### Design

- Green `#2F5D3A` / `#3d6b4a`, paper/white, ink `#1C2A1F`, gold accent `#B8892A`  
- India-first (UPI, GST, PIN, Telegram)  
- No fake social proof, no purple SaaS slop  

---

## 10. FAQ (benefit-aware)

**Q: What do I get for ₹16,000 a quarter?**  
A: A full billing system for your team — Telegram + web + photo bills, formal PDFs, GST control, staff names on every invoice, version history, day-end and Excel reports — for up to 80 invoices a month, with standard OCR.

**Q: We only do ~25 bills a month. Is Starter enough?**  
A: Yes. That’s well within Starter. You’re paying for control and professionalism, not for 100 bills you don’t use.

**Q: Why three prices?**  
A: Volume and OCR quality. More bills and harder handwriting need better models and more capacity — Growth and Pro cover that without slowing your counter.

**Q: Is GST included in the price?**  
A: Listed prices are **before GST**. GST extra as applicable.

**Q: Can staff who aren’t on the list still bill?**  
A: Yes. Choose **Others** and type their name. Add them to the permanent roster when they’re regulars.

**Q: If I change a menu price, does Telegram update?**  
A: Yes. Menu and staff live in one backend. Portal and bot use the same data.

**Q: Is this full accounting software?**  
A: No. Billing + collections + CA-ready export. Complements Tally / your CA.

---

## 11. Sales one-pager (speak this)

1. You get **paid with dignity** — formal invoice, not a notepad photo.  
2. Staff bill in **Telegram** (or photo / web); rates stay **locked to your menu**.  
3. You see **who billed**, **what changed**, **what’s collected**, and you **export Excel** for the CA.  
4. For a ~300-invoice-year extras desk, **Starter ₹16,000/quarter** (80/mo cap) is the natural fit; scale up only when volume or OCR load grows.

---

## 12. Success metrics for the marketing site

- Demo / contact form submits  
- Pricing section scroll depth  
- Sample invoice opens  
- Mobile load under 3s  

---

*End of prospect brief v3.0 · OmniDEL.ai / BillBanaoPay*
