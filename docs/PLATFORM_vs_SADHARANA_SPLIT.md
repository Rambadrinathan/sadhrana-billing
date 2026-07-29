# Platform vs customer deployment split

## BillBanaoPay (market product — OmniDEL.ai)

Public brand, website (billbanaoppay.com), sales, multi-customer product.

| Feature | In product |
|---------|------------|
| Telegram billing bot | Yes |
| Photo OCR (OpenRouter) | Yes |
| Price list / catalog | Yes (per customer) |
| GST ON/OFF per invoice | Yes (default 5% when ON) |
| Professional PDF + storage | Yes |
| Invoice edit + version history | Yes |
| Mark paid (UPI/cash/card) | Yes |
| Staff PIN + Owner/Admin dashboard | Yes |
| Public invoice link | Yes |
| Multi-tenant branding | Product capability |

**Marketing must stay generic.** Demo brand for screenshots: **Cedar Nook Homestay** (fictional).

---

## Sadharana Bagh (first customer deployment)

Private instance / config of BillBanaoPay for this customer only.

| Item | Specifics (ops, not marketing site) |
|------|-------------------------------------|
| Invoice trade name | Sadhrana Bagh / legal entity as configured |
| Legal entity | VJ Development Ventures LLP (from their sample tax invoice) |
| GSTIN / PAN / bank | From their CA invoice samples |
| Catalog | Beri House menu 2026 rates (veg 1200, non-veg 1500, high tea 700, bonfire 2000, etc.) |
| GST habit | Often 5% on F&B when applied; many operational bills need **GST OFF** — hence toggle |
| Telegram bot | @BillposSbagh_Bot (customer-specific) |
| Staff allowlist | Their manager Telegram IDs |
| Location units | Bamboo / Beri / Kerala / Library villas |
| Live URLs | Internal: sadhrana-billing.vercel.app (may rebrand to customer subdomain later) |

**Do not put “Sadharana” or real guest names on the public BillBanaoPay marketing site.**

---

## Implementation mapping

| User request | Platform | Sadharana config |
|--------------|----------|------------------|
| GST include/exclude | Telegram GST picker + `gst_applied` on bill | Used daily |
| Owner sees payments | `/admin` Owner login | ADMIN_PIN for owner |
| Staff bills | Telegram + web | Manager PIN + bot |
| Menu rates | Catalog table | Seeded from Beri menu PDF |
| Professional PDF | Shared engine | Logo + their GSTIN |

---

*Internal doc for OmniDEL team.*
