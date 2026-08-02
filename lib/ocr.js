/**
 * Handwritten bill OCR via vision LLM.
 * Supports: OPENROUTER_API_KEY, OPENAI_API_KEY, XAI_API_KEY (in that order).
 */
import { visionModel } from "@/lib/vision-model";

const SYSTEM = `You look at a photo for Sadhrana Bagh (villa estate, India) billing.

FIRST decide: is this a guest bill / invoice / handwritten slip / menu order with items and prices?
- Random photos (people, food, scenery, screenshots of chats, IDs, memes, receipts that are not a bill, blank paper) → NOT a bill.

Return ONLY valid JSON (no markdown):
{
  "is_bill": true or false,
  "not_bill_reason": "short plain English if is_bill is false, else null",
  "guest_name": "string or null",
  "villa": "Bamboo House|Beri House|Kerala House|The Library|Other / shared|null",
  "guest_phone": "string or null",
  "notes": "string or null",
  "lines": [
    { "description": "item name as WRITTEN on the slip", "qty": 1, "rate_inr": 1200, "amount_inr": 1200 }
  ],
  "written_subtotal_inr": 0,
  "written_gst_inr": 0,
  "written_total_inr": 0,
  "raw_text": "text you read, or short description of the image if not a bill"
}

READING THE QUANTITY COLUMN — this is where mistakes cost the most:
- The leftmost narrow column is QUANTITY. Read every digit carefully.
- Handwritten 11 is two strokes and is NOT 1. Likewise 8 is not 1, 6 is not 1, 9 is not 1.
- CHECK YOUR WORK: qty x rate must equal the amount written on that row.
  If 1 x 500 does not equal the written 5500, the qty is 11, not 1. Fix it.
- Put the amount written on the row in "amount_inr" so this can be verified.

READING THE TOTALS — always capture these, never skip them:
- "written_subtotal_inr": the sum written above the tax line (e.g. 49450)
- "written_gst_inr": the tax amount written (e.g. 2473)
- "written_total_inr": the final total written at the bottom (e.g. 51923)
- Use 0 only if genuinely absent from the paper. These are the cross-check.

If is_bill is false:
- lines must be []
- set not_bill_reason (e.g. "Looks like a chat screenshot, not a bill slip")

Record the rate that is WRITTEN on the slip, not the standard menu rate.
If the slip says Hi tea at 350, return 350 — do not "correct" it to 700.
Distinguish snacks/starters from lunch/dinner: they are different items at
different rates. "Veg snacks 400" is NOT "Veg Lunch/Dinner 1200".

Menu names and usual rates, for reference only (the slip wins on price):
- Vegetarian Lunch / Dinner ~1200
- Non-Vegetarian Lunch / Dinner ~1500
- High Tea (per person) ~700
- Vegetarian Starters / Veg Snacks ~400
- Non-Vegetarian Starters ~500
- Child / Baby food (half meal) ~600–750
- Barbecue Prix-Fixe ~1800
- Roast Chicken Meal ~900
- Burmese Khao Suey ~1000
- Vegetarian Pizza ~700 / Non-Veg Pizza ~950
- Bonfire ~2000
- Massage 60/90 min

Rules when is_bill is true:
- "Sold To" / villa name map to guest_name and villa.
- qty and rate from the slip.
- NEVER return a tax or total row as a line item. "5% GST", "CGST", "SGST",
  "Sub Total", "Total", "Round off" are NOT items — they belong only in the
  written_subtotal_inr / written_gst_inr / written_total_inr fields. Putting a
  GST row in "lines" makes the guest pay the tax twice.
- Skip blank rows.
- If guest name unclear, use "Guest".`;

export function hasVisionKey() {
  return Boolean(
    process.env.OPENROUTER_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.XAI_API_KEY
  );
}

export async function ocrBillFromImage(imageBuffer, mimeType = "image/jpeg") {
  if (!hasVisionKey()) {
    throw new Error(
      "OCR not configured. Set OPENROUTER_API_KEY (or OPENAI_API_KEY / XAI_API_KEY) on the server."
    );
  }

  const buf = Buffer.isBuffer(imageBuffer)
    ? imageBuffer
    : Buffer.from(imageBuffer || []);
  if (!buf.length) {
    throw new Error("Empty image — please resend the photo.");
  }

  // OpenRouter rejects non-image MIME (Telegram often sends application/octet-stream)
  const mime = normalizeImageMime(mimeType, buf);
  const b64 = buf.toString("base64");
  const dataUrl = `data:${mime};base64,${b64}`;

  let url;
  let headers;
  let model;

  if (process.env.OPENROUTER_API_KEY) {
    url = "https://openrouter.ai/api/v1/chat/completions";
    headers = {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL || "https://sadhrana-billing.vercel.app",
      "X-Title": "Sadhrana Billing OCR",
    };
    // Prefer a vision-capable model id on OpenRouter
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

  const body = {
    model,
    temperature: 0.1,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Is this a guest bill / order slip with items and prices? " +
              "If yes, extract details. If no, set is_bill false and say what the image looks like.",
          },
          {
            type: "image_url",
            image_url: {
              url: dataUrl,
              detail: "high",
            },
          },
        ],
      },
    ],
  };

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Vision API ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";
  const json = extractJson(content);

  // Not a bill / random image → friendly staff message (no tech jargon)
  if (
    json &&
    (json.is_bill === false ||
      json.is_bill === "false" ||
      String(json.image_type || "").toLowerCase() === "not_bill")
  ) {
    const why = String(json.not_bill_reason || json.raw_text || "").trim();
    const err = new Error("NOT_A_BILL");
    err.code = "NOT_A_BILL";
    err.reason = why;
    throw err;
  }

  if (!json || !Array.isArray(json.lines) || json.lines.length === 0) {
    const err = new Error("NOT_A_BILL");
    err.code = "NOT_A_BILL";
    err.reason =
      "Could not find bill items (guest name, villa, food/extra lines with rates).";
    throw err;
  }

  return {
    guest_name: json.guest_name || "Guest",
    villa: json.villa || "Other / shared",
    guest_phone: json.guest_phone || null,
    notes: json.notes || "From photo",
    lines: json.lines.map((l) => {
      const qty = Number(l.qty) || 1;
      const rate = Number(l.rate_inr) || 0;
      const written = Number(l.amount_inr) || 0;
      return {
        description: String(l.description || "Item").trim(),
        qty,
        rate_inr: rate,
        // What the paper says this row came to. Used to catch a misread qty:
        // if qty x rate != written amount, one of them was read wrong.
        written_amount_inr: written,
        row_mismatch: written > 0 && Math.abs(qty * rate - written) > 1,
        category: "other",
        gst_pct: 0,
      };
    }),
    // The figures written on the slip — the authoritative cross-check
    written_subtotal_inr: Number(json.written_subtotal_inr) || 0,
    written_gst_inr: Number(json.written_gst_inr) || 0,
    written_total_inr: Number(json.written_total_inr) || 0,
  };
}

/** Staff-facing message when photo is not a bill */
export function notBillMessage(reason) {
  const extra = reason ? `\n\nWhat I see: ${String(reason).slice(0, 180)}` : "";
  return (
    "📷 This photo does not look like a bill or order slip." +
    extra +
    "\n\nPlease either:\n" +
    "• Send a clear photo of the *handwritten bill / pad*, or\n" +
    "• Type the bill as text, or\n" +
    "• Tell me what this image is for (I only create guest invoices from bills)."
  );
}

const LEAD_SYSTEM = `You read screenshots of enquiry emails, WhatsApp chats, booking notes, or forms for Sadhrana Bagh (villa estate, Gurugram).

Return ONLY valid JSON:
{
  "is_enquiry": true or false,
  "raw_text": "all readable text, line breaks preserved",
  "guest_name": "string or null",
  "phone": "string or null",
  "email": "string or null",
  "dates": "date range text or null",
  "rooms": "villa/room text e.g. Library & Bamboo or null",
  "notes": "other requirements or null"
}

is_enquiry true for: email about stay, chat about booking, enquiry form, property request.
is_enquiry false for: bills with menu items/prices, random photos, IDs.`;

/**
 * OCR an enquiry screenshot / email photo into text for the lead wizard.
 */
export async function ocrLeadFromImage(imageBuffer, mimeType = "image/jpeg") {
  if (!hasVisionKey()) {
    throw new Error(
      "OCR not configured. Set OPENROUTER_API_KEY (or OPENAI_API_KEY / XAI_API_KEY)."
    );
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
      "X-Title": "Sadhrana Lead OCR",
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
        { role: "system", content: LEAD_SYSTEM },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract guest enquiry details for a villa stay booking. Prefer structured fields + full raw_text.",
            },
            {
              type: "image_url",
              image_url: { url: dataUrl, detail: "high" },
            },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Vision API ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";
  const json = extractJson(content) || {};
  if (json.is_enquiry === false) {
    const err = new Error("NOT_AN_ENQUIRY");
    err.code = "NOT_AN_ENQUIRY";
    err.reason = json.raw_text || "Not an enquiry screenshot";
    throw err;
  }

  // Build a multi-line paste the lead parser understands
  const lines = [];
  if (json.guest_name) lines.push(`Guest Name: ${json.guest_name}`);
  if (json.dates) lines.push(`Date: ${json.dates}`);
  if (json.rooms) lines.push(`Number of Rooms: ${json.rooms}`);
  if (json.phone) lines.push(`Phone: ${json.phone}`);
  if (json.email) lines.push(`Email: ${json.email}`);
  if (json.notes) lines.push(json.notes);
  if (json.raw_text && lines.length < 2) lines.push(String(json.raw_text));
  const paste =
    lines.join("\n").trim() ||
    String(json.raw_text || "").trim() ||
    "";
  if (!paste) {
    const err = new Error("NOT_AN_ENQUIRY");
    err.code = "NOT_AN_ENQUIRY";
    err.reason = "Could not read guest or dates from the image.";
    throw err;
  }
  return { paste, fields: json };
}

function normalizeImageMime(mimeType, buf) {
  const raw = String(mimeType || "")
    .toLowerCase()
    .split(";")[0]
    .trim();
  if (raw.startsWith("image/") && raw !== "image/*") {
    return raw === "image/jpg" ? "image/jpeg" : raw;
  }
  // Magic-byte sniff
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "image/png";
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return "image/jpeg";
}

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
