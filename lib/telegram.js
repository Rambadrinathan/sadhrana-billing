const API = "https://api.telegram.org";

export function getBotToken() {
  return process.env.TELEGRAM_BOT_TOKEN || "";
}

export function getAllowedIds() {
  const raw = process.env.TELEGRAM_ALLOWED_IDS || "";
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isAllowedUser(userId, chatId) {
  const allowed = getAllowedIds();
  if (allowed.length === 0) {
    // Fail closed if not configured
    return false;
  }
  const uid = String(userId || "");
  const cid = String(chatId || "");
  return allowed.includes(uid) || allowed.includes(cid);
}

async function tg(method, body) {
  const token = getBotToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.description || `Telegram ${method} failed`);
  }
  return data.result;
}

export async function sendMessage(chatId, text, extra = {}) {
  return tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: extra.parse_mode || "Markdown",
    reply_markup: extra.reply_markup,
    disable_web_page_preview: true,
  });
}

/** Send a PDF buffer as a document (professional tax invoice). */
export async function sendDocument(chatId, buffer, filename, caption) {
  const token = getBotToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append(
    "document",
    new Blob([buffer], { type: "application/pdf" }),
    filename || "invoice.pdf"
  );
  if (caption) form.append("caption", caption.slice(0, 1024));
  const res = await fetch(`${API}/bot${token}/sendDocument`, {
    method: "POST",
    body: form,
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || "sendDocument failed");
  return data.result;
}

export async function sendPlain(chatId, text, extra = {}) {
  return tg("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: extra.reply_markup,
    disable_web_page_preview: true,
  });
}

export async function answerCallback(callbackQueryId, text) {
  return tg("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text: text || "",
  });
}

export async function getFile(fileId) {
  return tg("getFile", { file_id: fileId });
}

export async function downloadFile(filePath) {
  const token = getBotToken();
  const res = await fetch(`${API}/file/bot${token}/${filePath}`);
  if (!res.ok) throw new Error("Could not download Telegram file");
  const buf = Buffer.from(await res.arrayBuffer());
  // Telegram often returns application/octet-stream — detect real image type
  const headerCt = res.headers.get("content-type") || "";
  const mimeType = detectImageMime(buf, filePath, headerCt);
  return { buffer: buf, mimeType };
}

/** Telegram/CDN rarely send image/*; sniff magic bytes + path. */
export function detectImageMime(buffer, filePath = "", headerCt = "") {
  const b = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    b.length >= 12 &&
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (b.length >= 6 && b.toString("ascii", 0, 3) === "GIF") {
    return "image/gif";
  }
  const path = String(filePath || "").toLowerCase();
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".gif")) return "image/gif";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  const ct = String(headerCt || "").toLowerCase().split(";")[0].trim();
  if (ct.startsWith("image/")) return ct;
  // Safe default for Telegram photos
  return "image/jpeg";
}

export async function setWebhook(url, secret) {
  return tg("setWebhook", {
    url,
    secret_token: secret || undefined,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
  });
}

export function confirmKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "✅ Confirm bill", callback_data: "confirm" },
        { text: "❌ Cancel", callback_data: "cancel" },
      ],
    ],
  };
}

export function paidKeyboard(billNo) {
  return {
    inline_keyboard: [
      [
        { text: "UPI paid", callback_data: `paid:${billNo}:upi` },
        { text: "Cash", callback_data: `paid:${billNo}:cash` },
        { text: "Card", callback_data: `paid:${billNo}:card` },
      ],
      [
        { text: "✏️ Edit invoice", callback_data: `edit:${billNo}` },
        { text: "📜 History", callback_data: `hist:${billNo}` },
      ],
    ],
  };
}

export const HELP_TEXT = `🌿 *Sadhrana Tax Invoice Bot*

*New bill (menu rates + 5% GST):*
\`\`\`
Guest: Ms. Abha Oberoi
Villa: Beri House
Veg Dinner x7
High Tea x7
Bonfire x1
\`\`\`
Or *photo* of handwritten pad (OCR via OpenRouter).

*Confirm* → Tax Invoice PDF with logo (stored).

*Edit existing*
/edit SB-2026-0003
then send the full corrected bill text, then yes.

*Commands*
/menu — rates
/today — today's invoices
/edit SB-xxxx — load bill to edit
/history SB-xxxx — version history
/pdf SB-xxxx — re-send PDF
/paid SB-xxxx upi
/cancel
/help`;
