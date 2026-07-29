import { VILLAS } from "@/lib/config";
import { matchCatalogItem } from "@/lib/bills";

const VILLA_ALIASES = {
  bamboo: "Bamboo House",
  beri: "Beri House",
  kerala: "Kerala House",
  library: "The Library",
  "the library": "The Library",
  shared: "Other / shared",
  other: "Other / shared",
};

function detectVilla(text) {
  const lower = text.toLowerCase();
  for (const v of VILLAS) {
    if (lower.includes(v.toLowerCase())) return v;
  }
  for (const [alias, full] of Object.entries(VILLA_ALIASES)) {
    if (new RegExp(`\\b${alias}\\b`, "i").test(lower)) return full;
  }
  return null;
}

/**
 * Parse manager free-text into a draft bill.
 *
 * Supported shapes:
 *   Guest: Sharma
 *   Villa: Bamboo
 *   Bonfire 2000
 *   Dinner x2 1100
 *   2 massage @2500
 *
 *   Sharma, Bamboo House
 *   bonfire 2000
 *   2 dinner 1100 each
 */
export function parseBillText(text, catalog = []) {
  const raw = String(text || "").trim();
  if (!raw) return { ok: false, error: "Empty message" };

  const linesIn = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let guest_name = null;
  let villa = null;
  let guest_phone = null;
  const notes = [];
  const items = [];

  const fieldRe =
    /^(guest|name|client|villa|room|phone|mobile|notes?)[:\-\s]+(.+)$/i;
  const itemRe =
    /^(?:(\d+(?:\.\d+)?)\s*[x×]\s*)?(.+?)\s*(?:[x×]\s*(\d+(?:\.\d+)?))?\s*(?:@|rs\.?|inr|₹)?\s*(\d+(?:\.\d+)?)\s*(?:each|\/-)?\s*$/i;
  const itemRe2 =
    /^(.+?)\s+(\d+(?:\.\d+)?)\s*(?:x|×)\s*(\d+(?:\.\d+)?)\s*$/i; // dinner 2 x 1100

  for (let i = 0; i < linesIn.length; i++) {
    const line = linesIn[i];
    const field = line.match(fieldRe);
    if (field) {
      const key = field[1].toLowerCase();
      const val = field[2].trim();
      if (key === "guest" || key === "name" || key === "client") guest_name = val;
      else if (key === "villa" || key === "room") villa = detectVilla(val) || val;
      else if (key === "phone" || key === "mobile") guest_phone = val;
      else notes.push(val);
      continue;
    }

    // First line often "Guest, Villa" or just guest
    if (i === 0 && !itemRe.test(line) && !itemRe2.test(line) && !/\d{2,}/.test(line)) {
      const parts = line.split(/[,\-|–]/).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const v = detectVilla(parts[parts.length - 1]);
        if (v) {
          villa = v;
          guest_name = parts.slice(0, -1).join(" ");
          continue;
        }
      }
      if (detectVilla(line)) {
        villa = detectVilla(line);
        continue;
      }
      if (!guest_name && parts[0] && parts[0].length < 60) {
        guest_name = parts[0];
        continue;
      }
    }

    let m = line.match(itemRe2);
    if (m) {
      items.push(buildItem(m[1], m[2], m[3], catalog));
      continue;
    }
    m = line.match(itemRe);
    if (m) {
      const qty = m[1] || m[3] || 1;
      const name = m[2];
      const rate = m[4];
      items.push(buildItem(name, qty, rate, catalog));
      continue;
    }

    // "bonfire - 2000" or "bonfire: 2000"
    m = line.match(/^(.+?)\s*[-:–]\s*₹?\s*(\d+(?:\.\d+)?)\s*$/);
    if (m) {
      items.push(buildItem(m[1], 1, m[2], catalog));
      continue;
    }
  }

  // Single-line compact: "Sharma Bamboo bonfire 2000 dinner 2x1100"
  if (items.length === 0 && linesIn.length === 1) {
    const compact = parseCompactLine(raw, catalog);
    if (compact.items.length) {
      return {
        ok: true,
        draft: {
          guest_name: compact.guest_name || guest_name || "Guest",
          villa: compact.villa || villa || "Other / shared",
          guest_phone,
          notes: notes.join("; ") || null,
          lines: compact.items,
        },
      };
    }
  }

  if (items.length === 0) {
    return {
      ok: false,
      error:
        "Could not find any priced items. Example:\n\nGuest: Sharma\nVilla: Bamboo\nBonfire 2000\nDinner x2 1100",
    };
  }

  return {
    ok: true,
    draft: {
      guest_name: guest_name || "Guest",
      villa: villa || "Other / shared",
      guest_phone,
      notes: notes.join("; ") || null,
      lines: items,
    },
  };
}

function buildItem(name, qty, rate, catalog) {
  const cleaned = String(name)
    .replace(/^(add|item)\s+/i, "")
    .trim();
  const matched = matchCatalogItem(cleaned, catalog);
  const q = Number(qty) || 1;
  const r = Number(rate);
  return {
    catalog_item_id: matched?.id || null,
    description: matched?.name || cleaned,
    category: matched?.category || guessCategory(cleaned),
    qty: q,
    rate_inr: Number.isFinite(r) ? r : Number(matched?.rate_inr) || 0,
    gst_pct: Number(matched?.gst_pct) || 0,
  };
}

function guessCategory(name) {
  const n = name.toLowerCase();
  if (/massage|bonfire|walk|sanctuary|yoga|experience/.test(n)) return "experience";
  if (/dinner|lunch|breakfast|tea|coffee|drink|bbq|barbecue|food|snack/.test(n)) return "fnb";
  return "other";
}

function parseCompactLine(text, catalog) {
  // Extract villa + guest heuristically, then scan for "word(s) number" pairs
  let rest = text;
  let villa = detectVilla(text);
  let guest_name = null;

  if (villa) {
    rest = rest.replace(new RegExp(villa, "i"), " ").replace(/\s+/g, " ").trim();
  }

  // guest = leading words before first number-bearing item
  const firstNum = rest.search(/\d/);
  if (firstNum > 0) {
    const head = rest.slice(0, firstNum).trim().replace(/[,\-]+$/, "").trim();
    if (head && head.length < 40) guest_name = head;
    rest = rest.slice(firstNum > 0 && guest_name ? firstNum : 0);
  }

  const items = [];
  // tokens like: bonfire 2000 | 2 dinner 1100 | dinner x2 1100
  const re =
    /(\d+(?:\.\d+)?\s*[x×]\s*)?([a-zA-Z][a-zA-Z\s\/&]{1,40}?)\s*(?:[x×]\s*(\d+(?:\.\d+)?))?\s*(?:@|rs\.?|₹)?\s*(\d{2,7}(?:\.\d+)?)/gi;
  let m;
  while ((m = re.exec(rest))) {
    const qty = m[1] || m[3] || 1;
    items.push(buildItem(m[2], qty, m[4], catalog));
  }
  return { guest_name, villa, items };
}

/** Format draft for Telegram message */
export function formatDraftPreview(draft, totals) {
  const lines = (draft.lines || [])
    .map(
      (l, i) =>
        `${i + 1}. ${l.description} × ${l.qty} @ ₹${Number(l.rate_inr).toLocaleString("en-IN")} = ₹${(
          (Number(l.qty) || 0) * (Number(l.rate_inr) || 0)
        ).toLocaleString("en-IN")}`
    )
    .join("\n");

  return [
    "📋 *Draft bill*",
    `Guest: *${escapeMd(draft.guest_name)}*`,
    `Villa: ${escapeMd(draft.villa)}`,
    draft.guest_phone ? `Phone: ${escapeMd(draft.guest_phone)}` : null,
    "",
    lines,
    "",
    `Subtotal: ₹${totals.subtotal.toLocaleString("en-IN")}`,
    totals.tax_total ? `Tax: ₹${totals.tax_total.toLocaleString("en-IN")}` : null,
    `*Total: ₹${totals.grand_total.toLocaleString("en-IN")}*`,
    "",
    "Reply *yes* / *confirm* to create, or *no* to cancel.",
    "Or send a corrected message.",
  ]
    .filter((x) => x !== null)
    .join("\n");
}

export function formatBillMessage(bill, appUrl) {
  const lines = (bill.bill_lines || [])
    .map(
      (l) =>
        `• ${l.description} × ${l.qty} = ₹${Number(l.line_total).toLocaleString("en-IN")}`
    )
    .join("\n");

  const inv = appUrl ? `${appUrl.replace(/\/$/, "")}/invoice/${bill.id}` : null;

  return [
    `✅ *Tax Invoice ${escapeMd(bill.bill_no)}*`,
    `${escapeMd(bill.guest_name)} · ${escapeMd(bill.villa)}`,
    "",
    lines,
    "",
    `Taxable + 5% GST (CGST 2.5% + SGST 2.5%)`,
    `*Total: ₹${Number(bill.grand_total).toLocaleString("en-IN")}*`,
    `Status: ${bill.status}${bill.payment_mode ? " · " + bill.payment_mode : ""}`,
    inv ? `\n🧾 Professional invoice:\n${inv}` : null,
    "",
    `Mark paid: *paid ${bill.bill_no} upi* (or cash/card)`,
  ]
    .filter((x) => x !== null)
    .join("\n");
}

function escapeMd(s) {
  return String(s || "").replace(/[_*`\[]/g, "\\$&");
}
