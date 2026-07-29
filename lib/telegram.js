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
  const ct = res.headers.get("content-type") || "image/jpeg";
  return { buffer: buf, mimeType: ct };
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
    ],
  };
}

export const HELP_TEXT = `🌿 *Sadhrana Checkout Bot*

*Create a bill — type it:*
\`\`\`
Guest: Sharma
Villa: Bamboo
Bonfire 2000
Dinner x2 1100
Massage 2500
\`\`\`

*Or one line:*
\`Sharma, Bamboo — bonfire 2000, 2 dinner 1100\`

*Or photo:*
Send a clear photo of the handwritten slip (guest name + items + amounts).

Then reply *yes* or tap *Confirm*.

*Commands*
/menu — price list
/today — today's bills
/paid SB-2026-0001 upi
/help — this message
/cancel — discard draft`;
