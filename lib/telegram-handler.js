import {
  sendMessage,
  sendPlain,
  answerCallback,
  getFile,
  downloadFile,
  confirmKeyboard,
  paidKeyboard,
  HELP_TEXT,
  isAllowedUser,
} from "@/lib/telegram";
import { parseBillText, formatDraftPreview, formatBillMessage } from "@/lib/parse-bill";
import { ocrBillFromImage, hasVisionKey } from "@/lib/ocr";
import {
  getCatalog,
  createBill,
  computeTotals,
  listBills,
  getBillByNo,
  updateBillStatus,
  matchCatalogItem,
} from "@/lib/bills";
import { saveDraft, getDraft, clearDraft } from "@/lib/drafts";
import { VILLAS } from "@/lib/config";

function appUrl() {
  return process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://sadhrana-billing.vercel.app";
}

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

async function enrichDraftWithCatalog(draft) {
  const catalog = await getCatalog();
  const lines = (draft.lines || []).map((l) => {
    const matched = matchCatalogItem(l.description, catalog);
    if (!matched) {
      return {
        ...l,
        category: l.category || "other",
        gst_pct: Number(l.gst_pct) || 0,
      };
    }
    // Prefer catalog rate only if user didn't give a rate
    const rate = Number(l.rate_inr) > 0 ? Number(l.rate_inr) : Number(matched.rate_inr);
    return {
      catalog_item_id: matched.id,
      description: matched.name,
      category: matched.category,
      qty: Number(l.qty) || 1,
      rate_inr: rate,
      gst_pct: Number(matched.gst_pct) || 0,
    };
  });
  return { ...draft, lines };
}

async function previewAndStore(chatId, draft) {
  const enriched = await enrichDraftWithCatalog(draft);
  const totals = computeTotals(enriched.lines);
  await saveDraft(chatId, enriched);
  const text = formatDraftPreview(enriched, totals);
  try {
    await sendMessage(chatId, text, { reply_markup: confirmKeyboard() });
  } catch {
    // Markdown may fail on odd names — plain fallback
    await sendPlain(
      chatId,
      text.replace(/\*/g, "") + "\n\nReply YES to confirm or NO to cancel.",
      { reply_markup: confirmKeyboard() }
    );
  }
}

async function confirmDraft(chatId) {
  const draft = await getDraft(chatId);
  if (!draft) {
    await sendPlain(chatId, "No draft to confirm. Send a bill as text or photo first.");
    return;
  }
  try {
    const bill = await createBill({
      villa: draft.villa,
      guest_name: draft.guest_name,
      guest_phone: draft.guest_phone || null,
      notes: draft.notes || null,
      lines: draft.lines,
      source: "telegram",
    });
    await clearDraft(chatId);
    const msg = formatBillMessage(bill, appUrl());
    try {
      await sendMessage(chatId, msg, {
        reply_markup: paidKeyboard(bill.bill_no),
      });
    } catch {
      await sendPlain(chatId, msg.replace(/\*/g, ""), {
        reply_markup: paidKeyboard(bill.bill_no),
      });
    }
  } catch (e) {
    await sendPlain(chatId, "Could not create bill: " + (e.message || e));
  }
}

async function handleCommand(chatId, text) {
  const [cmd, ...rest] = text.trim().split(/\s+/);
  const c = cmd.toLowerCase().replace(/@\w+$/, "");

  if (c === "/start" || c === "/help") {
    try {
      await sendMessage(chatId, HELP_TEXT);
    } catch {
      await sendPlain(chatId, HELP_TEXT.replace(/\*/g, "").replace(/`/g, ""));
    }
    return;
  }

  if (c === "/cancel") {
    await clearDraft(chatId);
    await sendPlain(chatId, "Draft cancelled.");
    return;
  }

  if (c === "/menu") {
    const catalog = await getCatalog();
    if (!catalog.length) {
      await sendPlain(chatId, "Menu empty — check Supabase catalog.");
      return;
    }
    const byCat = {};
    for (const item of catalog) {
      byCat[item.category] = byCat[item.category] || [];
      byCat[item.category].push(
        `• ${item.name} — ₹${Number(item.rate_inr).toLocaleString("en-IN")}`
      );
    }
    const body = Object.entries(byCat)
      .map(([cat, rows]) => `${cat.toUpperCase()}\n${rows.join("\n")}`)
      .join("\n\n");
    await sendPlain(chatId, `Menu\n\n${body}\n\nVillas: ${VILLAS.join(", ")}`);
    return;
  }

  if (c === "/today") {
    const bills = await listBills({ date: todayIst(), limit: 30 });
    if (!bills.length) {
      await sendPlain(chatId, "No bills today yet.");
      return;
    }
    const lines = bills.map(
      (b) =>
        `${b.bill_no} · ${b.guest_name} · ${b.villa} · ₹${Number(b.grand_total).toLocaleString("en-IN")} · ${b.status}`
    );
    const collected = bills
      .filter((b) => b.status === "paid")
      .reduce((s, b) => s + Number(b.grand_total), 0);
    await sendPlain(
      chatId,
      `Today (${todayIst()})\n\n${lines.join("\n")}\n\nCollected: ₹${collected.toLocaleString("en-IN")}`
    );
    return;
  }

  if (c === "/paid") {
    // /paid SB-2026-0001 upi
    const billNo = rest[0];
    const mode = (rest[1] || "upi").toLowerCase();
    if (!billNo) {
      await sendPlain(chatId, "Usage: /paid SB-2026-0001 upi");
      return;
    }
    const bill = await getBillByNo(billNo);
    if (!bill) {
      await sendPlain(chatId, "Bill not found: " + billNo);
      return;
    }
    const updated = await updateBillStatus(bill.id, { status: "paid", payment_mode: mode });
    await sendPlain(
      chatId,
      `Marked ${updated.bill_no} PAID via ${mode}. ₹${Number(updated.grand_total).toLocaleString("en-IN")}`
    );
    return;
  }

  // unknown slash — fall through as text if not only command
  if (c.startsWith("/")) {
    await sendPlain(chatId, "Unknown command. /help for options.");
  }
}

async function handleText(chatId, text) {
  const t = text.trim();
  const lower = t.toLowerCase();

  if (["yes", "y", "confirm", "ok", "haan", "ha"].includes(lower)) {
    await confirmDraft(chatId);
    return;
  }
  if (["no", "n", "cancel", "nah", "stop"].includes(lower)) {
    await clearDraft(chatId);
    await sendPlain(chatId, "Draft cancelled.");
    return;
  }

  // paid SB-2026-0001 upi (without slash)
  const paidM = t.match(/^paid\s+(SB-[\w-]+)\s*(upi|cash|card)?$/i);
  if (paidM) {
    const bill = await getBillByNo(paidM[1]);
    if (!bill) {
      await sendPlain(chatId, "Bill not found: " + paidM[1]);
      return;
    }
    const mode = (paidM[2] || "upi").toLowerCase();
    const updated = await updateBillStatus(bill.id, { status: "paid", payment_mode: mode });
    await sendPlain(
      chatId,
      `Marked ${updated.bill_no} PAID via ${mode}. ₹${Number(updated.grand_total).toLocaleString("en-IN")}`
    );
    return;
  }

  if (t.startsWith("/")) {
    await handleCommand(chatId, t);
    return;
  }

  const catalog = await getCatalog();
  const parsed = parseBillText(t, catalog);
  if (!parsed.ok) {
    await sendPlain(chatId, parsed.error);
    return;
  }
  await previewAndStore(chatId, parsed.draft);
}

async function handlePhoto(chatId, message) {
  await sendPlain(chatId, "Reading the slip…");
  try {
    if (!hasVisionKey()) {
      await sendPlain(
        chatId,
        "Photo OCR needs an AI key (OPENROUTER_API_KEY). For now, type the bill as text — /help"
      );
      return;
    }
    const photos = message.photo || [];
    const best = photos[photos.length - 1];
    if (!best?.file_id) {
      await sendPlain(chatId, "Could not read photo.");
      return;
    }
    const file = await getFile(best.file_id);
    const { buffer, mimeType } = await downloadFile(file.file_path);
    const draft = await ocrBillFromImage(buffer, mimeType);
    // caption can override guest/villa
    if (message.caption) {
      const cap = parseBillText(message.caption, await getCatalog());
      if (cap.ok) {
        if (cap.draft.guest_name && cap.draft.guest_name !== "Guest") {
          draft.guest_name = cap.draft.guest_name;
        }
        if (cap.draft.villa) draft.villa = cap.draft.villa;
        if (cap.draft.lines?.length) {
          // caption items merge if OCR weak
          draft.lines = [...draft.lines, ...cap.draft.lines];
        }
      }
    }
    await previewAndStore(chatId, draft);
  } catch (e) {
    await sendPlain(chatId, "OCR failed: " + (e.message || e));
  }
}

export async function handleUpdate(update) {
  // Callback buttons
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = cq.message?.chat?.id;
    const userId = cq.from?.id;
    if (!isAllowedUser(userId, chatId)) {
      await answerCallback(cq.id, "Not authorized");
      return;
    }
    const data = cq.data || "";
    if (data === "confirm") {
      await answerCallback(cq.id, "Creating…");
      await confirmDraft(chatId);
      return;
    }
    if (data === "cancel") {
      await clearDraft(chatId);
      await answerCallback(cq.id, "Cancelled");
      await sendPlain(chatId, "Draft cancelled.");
      return;
    }
    const paidM = data.match(/^paid:(.+):(upi|cash|card)$/);
    if (paidM) {
      const bill = await getBillByNo(paidM[1]);
      if (!bill) {
        await answerCallback(cq.id, "Not found");
        return;
      }
      await updateBillStatus(bill.id, { status: "paid", payment_mode: paidM[2] });
      await answerCallback(cq.id, "Marked paid");
      await sendPlain(chatId, `${bill.bill_no} marked PAID via ${paidM[2]}.`);
      return;
    }
    await answerCallback(cq.id, "OK");
    return;
  }

  const message = update.message;
  if (!message) return;

  const chatId = message.chat?.id;
  const userId = message.from?.id;
  if (!isAllowedUser(userId, chatId)) {
    await sendPlain(
      chatId,
      "Not authorized. Ask the owner to add your Telegram ID to TELEGRAM_ALLOWED_IDS."
    );
    return;
  }

  if (message.photo?.length) {
    await handlePhoto(chatId, message);
    return;
  }

  // Document image
  if (message.document?.mime_type?.startsWith("image/")) {
    await sendPlain(chatId, "Reading the image…");
    try {
      if (!hasVisionKey()) {
        await sendPlain(chatId, "Photo OCR needs OPENROUTER_API_KEY. Type the bill as text for now.");
        return;
      }
      const file = await getFile(message.document.file_id);
      const { buffer, mimeType } = await downloadFile(file.file_path);
      const draft = await ocrBillFromImage(buffer, mimeType || message.document.mime_type);
      await previewAndStore(chatId, draft);
    } catch (e) {
      await sendPlain(chatId, "OCR failed: " + (e.message || e));
    }
    return;
  }

  if (message.text) {
    await handleText(chatId, message.text);
  }
}
