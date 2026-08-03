/**
 * Supplier / purchase invoice OCR (capex & expenses).
 * Separate from guest checkout bill OCR.
 */
import { hasVisionKey } from "@/lib/ocr";
import { visionModel } from "@/lib/vision-model";

const SYSTEM = `You read a supplier purchase invoice / bill / tax invoice for Sadhrana Bagh estate (India).

FIRST: is this a purchase invoice from a vendor (shop, wholesaler, GST invoice for goods bought)?
- Guest restaurant slip / villa F&B pad for a guest → is_purchase false
- Random photos → is_purchase false

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
If true: fill amounts; use GST from invoice if visible else estimate from lines.`;

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

  return {
    vendor: json.vendor || null,
    invoice_date: json.invoice_date || null,
    invoice_no: json.invoice_no || null,
    amount_inr: Math.round(amount * 100) / 100,
    gst_amount_inr: Math.round(gst * 100) / 100,
    total_inr: Math.round(total * 100) / 100,
    suggested_category: json.suggested_category || "inventory",
    lines: lines.map((l) => ({
      description: String(l.description || "Item").trim(),
      qty: Number(l.qty) || 1,
      unit_cost_inr: Number(l.unit_cost_inr) || 0,
      gst_pct: Number(l.gst_pct) || 0,
      amount_inr:
        Number(l.amount_inr) ||
        (Number(l.qty) || 1) * (Number(l.unit_cost_inr) || 0),
    })),
    raw_text: json.raw_text || null,
  };
}
