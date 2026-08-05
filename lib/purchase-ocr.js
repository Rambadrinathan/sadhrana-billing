/**
 * Supplier / purchase invoice OCR (capex & expenses).
 * Separate from guest checkout bill OCR.
 */
import { hasVisionKey } from "@/lib/ocr";
import { visionModel } from "@/lib/vision-model";

const SYSTEM = `You read a supplier purchase invoice / bill / tax invoice for Sadhrana Bagh estate (India).

This covers ANY paper recording money the estate SPENT. The operator has already
told us it is a purchase — do not argue with the format of the paper.

is_purchase TRUE for all of these:
- A vendor / shop / wholesaler bill or GST tax invoice
- A handwritten VOUCHER, cash memo, debit note or kutcha slip
- An internal expense note — "Purchase", "Kitchen Exp.", "Dairy / Chicken /
  Vegetable / Grocery" — even with no vendor name, no GSTIN and no rates
- A consolidated day total for several small purchases
Missing vendor, missing GSTIN, missing item rates, or being an internal
accounting voucher are NEVER reasons to answer false.

is_purchase FALSE only for:
- A guest restaurant slip / villa F&B pad billed TO a guest (money coming in)
- A photo with no money on it at all

Return ONLY valid JSON:
{
  "is_purchase": true or false,
  "not_purchase_reason": "string or null",
  "vendor": "string or null",
  "invoice_date": "YYYY-MM-DD or null",
  "invoice_no": "string or null",
  "gstin_vendor": "string or null",
  "amount_inr": 0,
  "gst_amount_inr": 0,
  "total_inr": 0,
  "suggested_category": "inventory|fnb_ops|utilities|maintenance|other",
  "lines": [
    { "description": "item", "qty": 1, "unit_cost_inr": 0, "gst_pct": 18, "amount_inr": 0 }
  ],
  "raw_text": "short extract"
}

If is_purchase false: lines = [].

Amounts:
- total_inr is the figure written as the TOTAL on the paper. Read it exactly. Do
  not recompute it from the lines and do not round it.
- gst_amount_inr = 0 unless a tax/GST figure is actually written. Never estimate
  or add tax that is not on the paper.
- If items are listed with NO rates (e.g. "Dairy / Chicken / Vegetable" against
  one lump total), still emit one line per item named on the paper, qty 1,
  unit_cost_inr 0, amount_inr 0 — and put the whole figure in total_inr. Do not
  invent a split across them.
- If the paper names no items at all, lines = [] and total_inr = the figure.`;

function extractJson(text) {
  const cleaned = String(text || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeImageMime(mimeType, buf) {
  const raw = String(mimeType || "")
    .toLowerCase()
    .split(";")[0]
    .trim();
  if (raw.startsWith("image/") && raw !== "image/*") {
    return raw === "image/jpg" ? "image/jpeg" : raw;
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  return "image/jpeg";
}

export async function ocrPurchaseFromImage(imageBuffer, mimeType = "image/jpeg") {
  if (!hasVisionKey()) {
    throw new Error("Photo reading is not available right now.");
  }
  const buf = Buffer.isBuffer(imageBuffer)
    ? imageBuffer
    : Buffer.from(imageBuffer || []);
  if (!buf.length) throw new Error("Empty image");

  const mime = normalizeImageMime(mimeType, buf);
  const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;

  let url;
  let headers;
  let model;
  if (process.env.OPENROUTER_API_KEY) {
    url = "https://openrouter.ai/api/v1/chat/completions";
    headers = {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL || "https://sadhrana-billing.vercel.app",
      "X-Title": "Sadhrana Purchase OCR",
    };
    model = visionModel("openrouter");
  } else if (process.env.OPENAI_API_KEY) {
    url = "https://api.openai.com/v1/chat/completions";
    headers = {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    };
    model = visionModel("openai");
  } else {
    url = "https://api.x.ai/v1/chat/completions";
    headers = {
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      "Content-Type": "application/json",
    };
    model = visionModel("xai");
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract purchase invoice totals and line items if this is a supplier bill.",
            },
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Vision API ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";
  const json = extractJson(content);

  if (
    !json ||
    json.is_purchase === false ||
    json.is_purchase === "false"
  ) {
    const err = new Error("NOT_PURCHASE");
    err.code = "NOT_PURCHASE";
    err.reason = json?.not_purchase_reason || "Not a purchase invoice";
    throw err;
  }

  const lines = Array.isArray(json.lines) ? json.lines : [];
  let amount = Number(json.amount_inr) || 0;
  let gst = Number(json.gst_amount_inr) || 0;
  let total = Number(json.total_inr) || 0;
  if (!total && lines.length) {
    for (const l of lines) {
      amount += Number(l.amount_inr) || Number(l.qty || 1) * Number(l.unit_cost_inr || 0);
    }
    // NEVER invent tax. This used to add 18% whenever the invoice showed none,
    // which silently inflated every handwritten milk/chicken/vegetable slip by
    // 18% of fabricated GST. Most daily purchases are from unregistered vendors
    // and carry no tax at all.
    total = amount + gst;
  }
  if (!total) total = amount + gst;

  let outLines = lines.map((l) => ({
    description: String(l.description || "Item").trim(),
    qty: Number(l.qty) || 1,
    unit_cost_inr: Number(l.unit_cost_inr) || 0,
    gst_pct: Number(l.gst_pct) || 0,
    amount_inr:
      Number(l.amount_inr) ||
      (Number(l.qty) || 1) * (Number(l.unit_cost_inr) || 0),
  }));

  // A voucher often names what was bought ("Dairy / Chicken / Vegetable") against
  // ONE lump total, with no rates. Those lines all carry 0, and every caller
  // recomputes the total by summing lines — which would turn a Rs 22,029 voucher
  // into Rs 0. Collapse them into a single line that HOLDS the written total, so
  // the figure survives and stays editable (`1 = 22029`, or split with `+`).
  const lineSum = outLines.reduce((s, l) => s + (Number(l.amount_inr) || 0), 0);
  if (total > 0 && Math.round(lineSum) === 0) {
    const named = outLines
      .map((l) => l.description)
      .filter((d) => d && d.toLowerCase() !== "item")
      .join(", ");
    outLines = [
      {
        description: named || "Purchases",
        qty: 1,
        unit_cost_inr: Math.round(total * 100) / 100,
        gst_pct: 0,
        amount_inr: Math.round(total * 100) / 100,
        lump_sum: true,
      },
    ];
    amount = total;
  }

  return {
    vendor: json.vendor || null,
    invoice_date: json.invoice_date || null,
    invoice_no: json.invoice_no || null,
    amount_inr: Math.round(amount * 100) / 100,
    gst_amount_inr: Math.round(gst * 100) / 100,
    total_inr: Math.round(total * 100) / 100,
    suggested_category: json.suggested_category || "inventory",
    lines: outLines,
    raw_text: json.raw_text || null,
  };
}
