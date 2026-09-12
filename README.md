# Sadhrana Bagh — Checkout Billing

Phone-first billing for **on-site extras** (F&B, massage, bonfire).  
Room invoices stay with the CA. This app is for the **site manager at checkout**.

Stack: **Next.js → Vercel**, **Supabase** (Postgres).

## Live

| | |
|--|--|
| **Web** | https://sadhrana-billing.vercel.app |
| **Public bill** | `https://sadhrana-billing.vercel.app/b/{id}` |
| **Supabase** | https://supabase.com/dashboard/project/bkpynofvujxocvzudjba |
| **Manager PIN (web)** | `MANAGER_PIN` env |

## Primary interface: Telegram

Manager mostly uses **Telegram**, not the website.

### Manager flows

**1. Type a bill**
```
Guest: Sharma
Villa: Bamboo
Bonfire 2000
Dinner x2 1100
Massage 2500
```
Bot shows draft → **Confirm** (or reply `yes`) → formal bill + public link.

**2. Photo of handwritten slip**  
Send a clear photo (optionally caption with guest name). OCR reads items → same draft → confirm.

**3. Commands**
- `/menu` — catalog prices  
- `/today` — today’s bills  
- `/paid SB-2026-0001 upi` — mark paid  
- `/cancel` — drop draft  
- `/help`

### Telegram setup (once)

1. In Telegram, open **@BotFather** → `/newbot` → name e.g. `Sadhrana Checkout` → username e.g. `SadhranaBillBot`.
2. Copy the bot token.
3. Set Vercel env (Production):
   - `TELEGRAM_BOT_TOKEN` = token from BotFather  
   - `TELEGRAM_ALLOWED_IDS` = manager Telegram user id(s), comma-separated (get from @userinfobot)  
   - `APP_URL` = `https://sadhrana-billing.vercel.app`  
   - `OPENROUTER_API_KEY` = for photo OCR (optional for text-only)  
   - `TELEGRAM_SETUP_KEY` = any secret (e.g. same as manager PIN)
4. Redeploy, then open:  
   `https://sadhrana-billing.vercel.app/api/telegram/setup?key=YOUR_SETUP_KEY`  
   This registers the webhook.
5. Manager: DM the bot → `/start` → send a test bill.

**Do not reuse** the Claude/Grok channel bot token — each bot can only have one webhook.

## Web (backup)

1. Open the URL on phone → **Add to Home Screen**.
2. Enter PIN.
3. **New checkout bill** → pick villa + guest → tap menu items → Create.
4. **Print / Save PDF** or **Share on WhatsApp**.
5. Guest pays → mark **UPI / Cash / Card**.

## Local

```bash
npm install
# .env.local already wired if present
npm run dev
```

## Deploy

```bash
vercel --prod   # only after explicit approval for routine deploys
```

Env vars are on Vercel for Production + Development. Preview env may need re-adding if SSO-protected previews matter.

## Replace placeholder menu rates

After Deepak sends the real menu, edit `catalog_items` in Supabase Table Editor.

## Out of scope (by design)

- Room / package invoices (CA)
- OTA / channel manager / full PMS
- Inventory / kitchen KOT

## Bill numbers (CA series)

| Kind | Format | Continues after |
|------|--------|-----------------|
| Stay / Room | `VJD/2026_27/NNN` | `035` → next `036` |
| F&B | `VJD/RS/26_27/NNN` | `030` → next `031` |

Allocated by `allocateBillNo()` in `lib/bill-no.js` (optional atomic RPC from `supabase/SETUP_CA_INVOICE_SERIES.sql`). See `docs/INVOICE_SERIES.md`.
