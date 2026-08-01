# Sadhrana Bagh — Property ops

## One-time SQL

Supabase → SQL Editor → paste and run:

`supabase/SETUP_OPS.sql`

(or migration `20260801120000_property_ops.sql`)

Creates: `inv_locations`, `inv_items`, `expenses`, `attendance`, `guests`, `leads` + seed areas (villas, Dining, Kitchen, Linen, Common).

## Telegram (group or private)

| Command | Action |
|---------|--------|
| `/attendance` | Tap staff → clock in or out |
| `/attendance today` | Today’s punches |
| `in Munish` / `out Munish` | Free-type punch |
| `/inventory` | Pick area → list + value |
| `/inventory value` | Totals by area |
| `/expense Title \| amt \| gst \| cat` | Log expense |
| `/purchase` then photo | Supplier invoice OCR → expense (+ optional stock) |
| `/guest Name \| phone \| notes` | Guest directory |
| `/lead Name \| phone \| type \| notes` | Enquiry |
| `/leads` | Open pipeline |
| `/ops` | Ops help |

## Web

- https://sadhrana-billing.vercel.app/inventory  
- https://sadhrana-billing.vercel.app/expenses  
- https://sadhrana-billing.vercel.app/attendance  
- https://sadhrana-billing.vercel.app/guests  
- https://sadhrana-billing.vercel.app/leads  

## Status

- **A–D shipped:** schema, attendance, inventory, expenses, purchase OCR + file store, guests, leads  
- Billing unchanged  

