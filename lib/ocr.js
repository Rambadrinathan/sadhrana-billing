/**
 * Handwritten bill OCR via vision LLM.
 * Supports: OPENROUTER_API_KEY, OPENAI_API_KEY, XAI_API_KEY (in that order).
 */

const SYSTEM = `You extract guest checkout bill details from a photo of a handwritten or printed bill pad for Sadhrana Bagh villa estate (India).

Return ONLY valid JSON (no markdown):
{
  "guest_name": "string",
  "villa": "Bamboo House|Beri House|Kerala House|The Library|Other / shared|null",
  "guest_phone": "string or null",
  "notes": "string or null",
  "lines": [
    { "description": "item name", "qty": 1, "rate_inr": 1200 }
  ],
  "raw_text": "full OCR text you read"
}

Official billable menu names (map handwriting to closest):
- Vegetarian Lunch / Dinner (often "Veg Lunch" / "Veg Dinner") ~1200
- Non-Vegetarian Lunch / Dinner ~1500
- High Tea (per person) ~700 (sometimes written Hi Tea 350)
- Vegetarian Starters / Veg Snacks ~400
- Non-Vegetarian Starters ~500
- Child / Baby food (half meal) ~600–750
- Barbecue Prix-Fixe ~1800
- Roast Chicken Meal ~900
- Burmese Khao Suey ~1000
- Vegetarian Pizza ~700 / Non-Veg Pizza ~950
- Bonfire ~2000
- Massage 60/90 min

Rules:
- "Sold To" / "Bought of" / villa name (Beri House etc.) map to guest_name and villa.
- qty and rate from the slip columns.
- Prefer official menu description names above when you recognise them.
- Skip blank rows and the GST total line (5% GST is applied by system, not as a line item).
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
    model = process.env.OCR_MODEL || "openai/gpt-4o-mini";
  } else if (process.env.OPENAI_API_KEY) {
    url = "https://api.openai.com/v1/chat/completions";
    headers = {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    };
    model = process.env.OCR_MODEL || "gpt-4o-mini";
  } else {
    url = "https://api.x.ai/v1/chat/completions";
    headers = {
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      "Content-Type": "application/json",
    };
    model = process.env.OCR_MODEL || "grok-2-vision-1212";
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
            text: "Extract the bill details from this photo of a handwritten or printed bill.",
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
  if (!json || !Array.isArray(json.lines) || json.lines.length === 0) {
    throw new Error("Could not read any items from the photo. Try a clearer picture or type the bill as text.");
  }

  return {
    guest_name: json.guest_name || "Guest",
    villa: json.villa || "Other / shared",
    guest_phone: json.guest_phone || null,
    notes: json.notes || (json.raw_text ? "OCR: " + String(json.raw_text).slice(0, 200) : "From photo"),
    lines: json.lines.map((l) => ({
      description: String(l.description || "Item").trim(),
      qty: Number(l.qty) || 1,
      rate_inr: Number(l.rate_inr) || 0,
      category: "other",
      gst_pct: 0,
    })),
  };
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
