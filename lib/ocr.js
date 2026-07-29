/**
 * Handwritten bill OCR via vision LLM.
 * Supports: OPENROUTER_API_KEY, OPENAI_API_KEY, XAI_API_KEY (in that order).
 */

const SYSTEM = `You extract guest checkout bill details from a photo of a handwritten or printed slip for a boutique villa estate (Sadhrana Bagh, India).

Return ONLY valid JSON (no markdown):
{
  "guest_name": "string",
  "villa": "Bamboo House|Beri House|Kerala House|The Library|Other / shared|null",
  "guest_phone": "string or null",
  "notes": "string or null",
  "lines": [
    { "description": "item name", "qty": 1, "rate_inr": 2000 }
  ],
  "raw_text": "full OCR text you read"
}

Rules:
- Rates are in Indian Rupees (INR). Ignore currency symbols.
- qty defaults to 1 if not written.
- Prefer clear item names (Bonfire, Dinner, Massage, Breakfast, etc.).
- If guest name unclear, use "Guest".
- If villa unclear, null.
- Include every priced line you can read. Skip illegible lines rather than inventing.`;

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

  const b64 = Buffer.from(imageBuffer).toString("base64");
  const dataUrl = `data:${mimeType};base64,${b64}`;

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
            text: "Extract the bill details from this photo.",
          },
          {
            type: "image_url",
            image_url: { url: dataUrl },
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
