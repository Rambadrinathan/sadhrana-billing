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

/**
 * Send a PDF buffer as a document (professional tax invoice).
 * @param {object} [extra] - optional { reply_markup }
 */
export async function sendDocument(chatId, buffer, filename, caption, extra = {}) {
  const token = getBotToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append(
    "document",
    new Blob([buffer], { type: "application/pdf" }),
    filename || "invoice.pdf"
  );
  if (caption) form.append("caption", String(caption).slice(0, 1024));
  if (extra.reply_markup) {
    form.append("reply_markup", JSON.stringify(extra.reply_markup));
  }
  const res = await fetch(`${API}/bot${token}/sendDocument`, {
    method: "POST",
    body: form,
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || "sendDocument failed");
  return data.result;
}

/**
 * Send text that contains *bold* / `code` markup. Tries Markdown, and if Telegram
 * rejects the entities, resends with the markup stripped rather than showing
 * literal asterisks to staff.
 */
export async function sendRich(chatId, text, extra = {}) {
  try {
    return await sendMessage(chatId, text, extra);
  } catch {
    return sendPlain(chatId, text.replace(/\*/g, "").replace(/`/g, ""), extra);
  }
}

export async function sendPlain(chatId, text, extra = {}) {
  return tg("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: extra.reply_markup,
    disable_web_page_preview: true,
  });
}

export async function answerCallback(callbackQueryId, text, extra = {}) {
  return tg("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text: (text || "").slice(0, 200),
    show_alert: extra.show_alert === true,
  });
}

/** Update inline keyboard (✓ highlights) without a new chat bubble */
export async function editMessageReplyMarkup(chatId, messageId, reply_markup) {
  return tg("editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup,
  });
}

/** Update message body + optional keyboard (selection summary + estimate) */
export async function editMessageText(chatId, messageId, text, extra = {}) {
  const body = {
    chat_id: chatId,
    message_id: messageId,
    text,
    disable_web_page_preview: true,
  };
  if (extra.parse_mode) body.parse_mode = extra.parse_mode;
  if (extra.reply_markup) body.reply_markup = extra.reply_markup;
  return tg("editMessageText", body);
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

/**
 * Draft keyboard: staff (from admin roster) + GST + confirm.
 * @param {boolean} gstApplied
 * @param {{ id: string, name: string }[]} staffList
 * @param {string|null} selectedStaffName
 */
/**
 * @param {boolean} gstApplied
 * @param {Array} staffList - unused; picker removed (single operator)
 * @param {string|null} selectedStaffName - unused
 * @param {boolean} gstInclusive - amounts keyed in already include the 5%
 */
export function confirmKeyboard(
  gstApplied = true,
  staffList = [],
  selectedStaffName = null,
  gstInclusive = false,
  cardFee = false,
  cardFeePct = 2.5
) {
  const rows = [];

  // No staff picker. Munish raises every bill and every purchase, so asking
  // "who is this?" on each one is a tap that only creates a chance to get it
  // wrong. Attribution is set from BILLING_OPERATOR. Change that env var (or
  // restore this picker) if more than one person starts billing.
  // Three states, one button, cycled in the order Munish actually needs them:
  //
  //   ON        — amounts are pre-tax, add 5% (the usual F&B slip)
  //   INCLUSIVE — the amount written on the bill is what the guest paid, tax
  //               already inside. Key in 6,000 and the invoice totals 6,000.
  //   OFF       — no tax at all
  //
  // The label names the CURRENT state and says what tapping does, because a
  // bare "GST" toggle with three states is unreadable on a phone.
  const gstState = !gstApplied ? "off" : gstInclusive ? "incl" : "on";
  const GST_CYCLE = {
    on: {
      text: "🧾 GST: ON (5% added) — tap if bill INCLUDES GST",
      next: "gst:incl",
    },
    incl: {
      text: "🧾 GST: amount INCLUDES 5% — tap to turn GST OFF",
      next: "gst:off",
    },
    off: {
      text: "🧾 GST: OFF — tap to add 5%",
      next: "gst:on",
    },
  };
  rows.push([
    { text: GST_CYCLE[gstState].text, callback_data: GST_CYCLE[gstState].next },
  ]);
  // Card fee. Separate from the GST cycle on purpose: it is a different
  // question (how is the guest paying?) and it applies the same way whichever
  // of the three GST states the bill is in — 2.5% of whatever the grand total
  // came to. It has to be answered HERE, before Confirm, because the fee is
  // printed on the invoice; the "Card" button on the next card only records
  // that the money came in.
  const feeLabel = String(cardFeePct).replace(/\.0+$/, "");
  rows.push([
    cardFee
      ? {
          text: `💳 Card: +${feeLabel}% fee ADDED — tap to remove`,
          callback_data: "card:off",
        }
      : {
          text: `💳 Paying by card? tap to add ${feeLabel}% fee`,
          callback_data: "card:on",
        },
  ]);
  rows.push([
    { text: "✅ Confirm bill", callback_data: "confirm" },
    { text: "❌ Cancel", callback_data: "cancel" },
  ]);

  return { inline_keyboard: rows };
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

export const HELP_TEXT = `🌿 *Sadhrana Bagh Bot*

_Nothing is created unless you send a command first._

*Billing*
*/bill* — then slip photo or typed items → staff → Confirm → PDF
Tap the GST button to cycle: *ON* (adds 5%) → *amount INCLUDES GST*
(key in the figure on the bill as-is) → *OFF*
💳 If the guest is paying by *card*, tap the card button BEFORE Confirm —
it adds 2.5% on the after-GST total and prints it on the invoice.

*Bills already made*
/pdf SB-2026-0003 — re-send PDF
/edit SB-2026-0003 — revise
/paid SB-2026-0003 upi — mark paid
/history SB-2026-0003 — versions

*Ops*
/attendance · /inventory · /expense · /purchase
/guest · /lead · /leads · /ops

*Commands*
/menu · /today · /staff · /help · /cancel`;

export const OPS_HELP = `🌿 *Sadhrana ops*

*/attendance* — clock in/out  
*/inventory* — stock by area + value  
*/expense* — log spend (text)  
*/purchase* — then send *supplier invoice photo* → check items → ✏️ fix any OCR mistake → save
*/guest* — add guest: Guest Name | phone | notes  
*/lead* — paste text or photo of enquiry → B2B/B2C + room ✓ toggles + rack estimate  
*/leads* — open enquiries  

Web: Inventory · Expenses · Guests · Leads · Attendance`;

/**
 * Purchase review keyboard. `showAdopt` appears only when the line items don't
 * add up to the invoice total, so staff can accept the items' arithmetic.
 */
export function purchaseKeyboard({ showAdopt = false, gstOn = false } = {}) {
  const rows = [[{ text: "✏️ Edit items", callback_data: "purch:edit" }]];
  // GST is OFF by default on purchases — daily buying from local vendors carries
  // no tax. Formal GST invoices are the exception, so it's one tap to add.
  rows.push([
    {
      text: gstOn
        ? "🧾 GST 18% ON — tap to remove"
        : "🧾 No GST — tap to add 18%",
      callback_data: gstOn ? "purch:gstoff" : "purch:gston",
    },
  ]);
  if (showAdopt) {
    rows.push([
      { text: "🔢 Use items total", callback_data: "purch:adopt" },
    ]);
  }
  rows.push([
    { text: "✅ Save as expense", callback_data: "purch:expense" },
    { text: "📦 + inventory lines", callback_data: "purch:inv" },
  ]);
  rows.push([{ text: "❌ Cancel", callback_data: "cancel" }]);
  return { inline_keyboard: rows };
}

/**
 * Shown when a photo arrives with no command behind it. Nothing is OCR'd or
 * saved until staff say what the photo is — stops junk drafts.
 */
export function photoIntentKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🧾 Guest bill", callback_data: "pick:bill" }],
      [{ text: "📦 Purchase invoice", callback_data: "pick:purchase" }],
      [{ text: "📋 Lead / enquiry", callback_data: "pick:lead" }],
      [{ text: "❌ Ignore", callback_data: "pick:none" }],
    ],
  };
}

/**
 * Attendance punch board. Each button is the NEXT action for that person,
 * so there is nothing to interpret: tap to clock them in, tap again to
 * clock them out. Every tap writes immediately — no save step.
 */
export function rosterKeyboard(entries = []) {
  const rows = [];
  const actionable = entries.filter((e) => e.state !== "done");

  for (const e of actionable) {
    const short = String(e.name).slice(0, 14);
    if (e.state === "in") {
      rows.push([
        {
          text: `⏹ OUT · ${short} (in ${e.in})`,
          callback_data: `pn:out:${short}`,
        },
      ]);
    } else {
      rows.push([
        { text: `▶ IN · ${short}`, callback_data: `pn:in:${short}` },
        { text: "✖", callback_data: `pn:abs:${short}` },
      ]);
    }
  }

  rows.push([
    { text: "↺ Refresh", callback_data: "pn:refresh" },
    { text: "🚫 Rest absent", callback_data: "pn:rest" },
  ]);
  return { inline_keyboard: rows };
}

/** Shown while staff are correcting OCR'd line items. */
export function purchaseEditKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "✅ Done", callback_data: "purch:review" },
        { text: "📋 Show items", callback_data: "purch:show" },
      ],
      [{ text: "❌ Cancel", callback_data: "cancel" }],
    ],
  };
}

/** Location for allocating purchase lines into inventory */
export function purchaseLocKeyboard(locations = []) {
  const rows = [];
  const list = locations || [];
  for (let i = 0; i < list.length; i += 2) {
    rows.push(
      list.slice(i, i + 2).map((loc) => ({
        text: String(loc.name).slice(0, 28),
        callback_data: `purchloc:${String(loc.id).slice(0, 40)}`,
      }))
    );
  }
  rows.push([{ text: "Expense only (no stock)", callback_data: "purch:expense" }]);
  return { inline_keyboard: rows };
}

/** Staff picker for attendance */
export function attendanceKeyboard(staffList = [], opens = {}) {
  const rows = [];
  const active = (staffList || []).filter((s) => s && s.name);
  for (let i = 0; i < active.length; i += 2) {
    const pair = active.slice(i, i + 2).map((s) => {
      const open = opens[String(s.name).toLowerCase()];
      const label = open ? `⏹ ${s.name} (out)` : `▶ ${s.name} (in)`;
      return {
        text: label.slice(0, 32),
        callback_data: `att:${String(s.id || s.name).slice(0, 40)}`,
      };
    });
    rows.push(pair);
  }
  rows.push([
    { text: "📋 Today", callback_data: "att:today" },
    { text: "Others…", callback_data: "att:others" },
  ]);
  return { inline_keyboard: rows };
}

/** B2B / B2C for lead draft — selected option shows ✓ */
export function leadSegmentKeyboard(selected = null) {
  const s = String(selected || "").toLowerCase();
  return {
    inline_keyboard: [
      [
        {
          text: `${s === "b2c" ? "✓ " : ""}B2C — Family / personal`,
          callback_data: "leadseg:b2c",
        },
        {
          text: `${s === "b2b" ? "✓ " : ""}B2B — Corporate / group`,
          callback_data: "leadseg:b2b",
        },
      ],
      [{ text: "❌ Cancel", callback_data: "lead:cancel" }],
    ],
  };
}

/**
 * Multi-select villa / buyout picker.
 * Selected rooms show ✓ — Telegram buttons do NOT type into the chat box;
 * they only fire callbacks (toast + keyboard update).
 * @param {string[]} selected - villa names or "Entire property"
 */
export function leadStayKeyboard(selected = []) {
  const sel = new Set(
    (Array.isArray(selected) ? selected : [selected]).filter(Boolean)
  );
  const buyout = sel.has("Entire property");
  const mark = (id) => (buyout ? id === "Entire property" : sel.has(id));
  const btn = (id, label) => ({
    text: `${mark(id) ? "✓ " : "○ "}${label}`,
    callback_data: `leadtoggle:${id}`,
  });
  return {
    inline_keyboard: [
      [btn("Bamboo House", "Bamboo House (1BR)")],
      [btn("The Library", "The Library (1BR)")],
      [btn("Kerala House", "Kerala House (2BR)")],
      [btn("Beri House", "Beri House (5BR)")],
      [btn("Entire property", "Entire property buyout (all 4)")],
      [
        {
          text: "✅ Save lead with selection",
          callback_data: "lead:confirm",
        },
      ],
      [{ text: "❌ Cancel", callback_data: "lead:cancel" }],
    ],
  };
}

/** Location picker for inventory */
export function inventoryLocKeyboard(locations = []) {
  const rows = [];
  const list = locations || [];
  for (let i = 0; i < list.length; i += 2) {
    const pair = list.slice(i, i + 2).map((loc) => ({
      text: String(loc.name).slice(0, 28),
      callback_data: `invloc:${String(loc.id).slice(0, 40)}`,
    }));
    rows.push(pair);
  }
  if (!rows.length) {
    rows.push([{ text: "No locations — run SETUP_OPS.sql", callback_data: "invloc:none" }]);
  }
  return { inline_keyboard: rows };
}
