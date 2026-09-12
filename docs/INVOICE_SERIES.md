# Invoice series (CA-locked)

**Source:** Chartered accountant, Sep 2026  
**Rule:** Do not invent a different format. Continue the CA’s serials.

| Kind | Format | CA last issued | Next app issue |
|------|--------|----------------|----------------|
| **Stay / Room** | `VJD/2026_27/NNN` | `VJD/2026_27/035` | `VJD/2026_27/036` |
| **F&B** | `VJD/RS/26_27/NNN` | `VJD/RS/26_27/030` | `VJD/RS/26_27/031` |

- FY segment uses **underscores** (`2026_27`, `26_27`), not hyphens.
- Stay uses the **full** start year; F&B uses the **two-digit** start year — match CA paper.
- Indian FY runs April–March; labels roll automatically in `lib/bill-no.js` / `indian_fy_labels()`.

## Code

| Piece | Path |
|-------|------|
| Allocator | `lib/bill-no.js` → `allocateBillNo()` |
| Wired from | `lib/bills.js` → `createBill()` |
| Postgres (atomic) | `supabase/SETUP_CA_INVOICE_SERIES.sql` → `next_bill_no_for(p_kind)` |

Until the SQL setup is applied, the app still issues correct CA numbers via the JS fallback (max of CA floor and any existing `VJD…` rows). Apply the SQL for atomic counters under concurrent use.

## Historical app numbers (do not reuse)

Earlier app builds used `SB-2026-NNNN` (F&B) and `SB/STAY/2026-27/NNN` (rooms). Those rows stay as-is; **new** invoices use the CA `VJD…` series only.
