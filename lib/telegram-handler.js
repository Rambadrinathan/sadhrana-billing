import {
  sendMessage,
  sendPlain,
  sendDocument,
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
import { listStaff } from "@/lib/staff";
import { saveDraft, getDraft, clearDraft } from "@/lib/drafts";
import {
  generateAndStoreInvoicePdf,
  editBill,
  listBillVersions,
} from "@/lib/invoice-store";
import { VILLAS, PROPERTY } from "@/lib/config";

function appUrl() {
  return process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://sadhrana-billing.vercel.app";
}

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/**
 * Always re-load catalog from Supabase so Admin → Menu rate edits apply immediately.
 */
async function enrichDraftWithCatalog(draft) {
  const catalog = await getCatalog();
  const lines = (draft.lines || []).map((l) => {
    const matched =
      (l.catalog_item_id && catalog.find((c) => c.id === l.catalog_item_id)) ||
      matchCatalogItem(l.description, catalog);
    if (!matched) {
      return {
        ...l,
        description: String(l.description || "Item").trim(),
        category: l.category || "other",
        qty: Number(l.qty) || 1,
        rate_inr: Number(l.rate_inr) || 0,
        gst_pct: PROPERTY.defaultGstPct,
        hsn_sac: PROPERTY.defaultHsn,
      };
    }
    return {
      catalog_item_id: matched.id,
      description: matched.name,
      category: matched.category,
      qty: Number(l.qty) || 1,
      // Live rate from menu — not a stale draft value
      rate_inr: Number(matched.rate_inr),
      gst_pct: Number(matched.gst_pct) || PROPERTY.defaultGstPct,
      hsn_sac: matched.hsn_sac || PROPERTY.defaultHsn,
    };
  });
  return { ...draft, lines };
}

async function previewAndStore(chatId, draft) {
  // Fresh menu rates every preview
  const enriched = await enrichDraftWithCatalog(draft);
  if (enriched.gst_applied === undefined) enriched.gst_applied = true;

  // Preserve staff selection if already set
  if (draft.created_by && !enriched.created_by) {
    enriched.created_by = draft.created_by;
  }

  const staffList = await listStaff({ includeInactive: false });
  const totals = computeTotals(enriched.lines, {
    applyGst: enriched.gst_applied !== false,
  });
  await saveDraft(chatId, enriched);

  const editNote = enriched.edit_bill_no
    ? `\n✏️ *Editing ${enriched.edit_bill_no}* (v${(enriched.edit_version || 1) + 1} will be saved; old version kept in history)\n`
    : "";
  const gstNote =
    enriched.gst_applied === false
      ? "\n🧾 *GST: OFF* (no 5% tax on this invoice)\n"
      : "\n🧾 *GST: ON* (5% = CGST 2.5% + SGST 2.5%)\n";
  const staffNote = enriched.created_by
    ? `\n👤 *Staff: ${enriched.created_by}*\n`
    : staffList.length
      ? `\n👤 *Select staff below* (required)\n`
      : `\n👤 No staff roster yet — add under Owner → Staff on web\n`;

  const text =
    editNote + staffNote + gstNote + formatDraftPreview(enriched, totals);
  const kb = confirmKeyboard(
    enriched.gst_applied !== false,
    staffList,
    enriched.created_by || null
  );
  try {
    await sendMessage(chatId, text, { reply_markup: kb });
  } catch {
    await sendPlain(
      chatId,
      text.replace(/\*/g, "") +
        "\n\nTap staff name, GST if needed, then Confirm. Or reply YES / NO.",
      { reply_markup: kb }
    );
  }
}

async function sendInvoicePdf(chatId, bill, pdfBuffer, extraCaption = "") {
  const fname = `${String(bill.bill_no).replace(/\//g, "-")}-v${bill.version || 1}.pdf`;
  const cap = [
    `Tax Invoice ${bill.bill_no}` + (bill.version > 1 ? ` (Rev. ${bill.version})` : ""),
    `${bill.guest_name} · ${bill.villa}`,
    `Total ₹${Number(bill.grand_total).toLocaleString("en-IN")} (incl. 5% GST)`,
    `GSTIN ${PROPERTY.gstin}`,
    bill.pdf_url ? `Stored: ${bill.pdf_url}` : null,
    `View: ${appUrl()}/invoice/${bill.id}`,
    extraCaption || null,
  ]
    .filter(Boolean)
    .join("\n");
  await sendDocument(chatId, pdfBuffer, fname, cap);
}

async function confirmDraft(chatId) {
  let draft = await getDraft(chatId);
  if (!draft) {
    await sendPlain(chatId, "No draft to confirm. Send a bill as text or photo first.");
    return;
  }

  // Re-pull live menu rates right before save (Admin menu edits win)
  draft = await enrichDraftWithCatalog(draft);
  await saveDraft(chatId, draft);

  const staffList = await listStaff({ includeInactive: false });
  if (staffList.length > 0 && !String(draft.created_by || "").trim()) {
    await sendPlain(
      chatId,
      "Select *which staff* is creating this bill (tap a name on the draft buttons), then Confirm again."
    );
    await previewAndStore(chatId, draft);
    return;
  }

  try {
    let result;
    const gstApplied = draft.gst_applied !== false;
    const createdBy = String(draft.created_by || "").trim() || null;
    if (draft.edit_bill_id) {
      result = await editBill(draft.edit_bill_id, {
        villa: draft.villa,
        guest_name: draft.guest_name,
        guest_phone: draft.guest_phone || null,
        notes: draft.notes || null,
        lines: draft.lines,
        gst_applied: gstApplied,
        change_note:
          (draft.change_note || "Edited via Telegram") +
          (createdBy ? ` · by ${createdBy}` : ""),
      });
    } else {
      const bill = await createBill({
        villa: draft.villa,
        guest_name: draft.guest_name,
        guest_phone: draft.guest_phone || null,
        notes: draft.notes || null,
        lines: draft.lines,
        source: "telegram",
        gst_applied: gstApplied,
        created_by: createdBy,
      });
      result = await generateAndStoreInvoicePdf(bill);
    }

    await clearDraft(chatId);
    const { bill, pdfBuffer } = result;

    try {
      await sendInvoicePdf(
        chatId,
        bill,
        pdfBuffer,
        draft.edit_bill_id ? "Previous version archived in history." : null
      );
    } catch (pdfErr) {
      console.error("pdf send", pdfErr);
      await sendPlain(chatId, "Bill saved but PDF send failed: " + (pdfErr.message || pdfErr));
    }

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
    await sendPlain(chatId, "Could not save bill: " + (e.message || e));
  }
}

async function startEdit(chatId, billNo) {
  const bill = await getBillByNo(billNo);
  if (!bill) {
    await sendPlain(chatId, "Bill not found: " + billNo);
    return;
  }
  const draft = {
    edit_bill_id: bill.id,
    edit_bill_no: bill.bill_no,
    edit_version: bill.version || 1,
    villa: bill.villa,
    guest_name: bill.guest_name,
    guest_phone: bill.guest_phone,
    notes: bill.notes,
    lines: (bill.bill_lines || []).map((l) => ({
      catalog_item_id: l.catalog_item_id,
      description: l.description,
      category: l.category,
      qty: l.qty,
      rate_inr: l.rate_inr,
      gst_pct: l.gst_pct,
    })),
    change_note: "Edited via Telegram",
  };
  await previewAndStore(chatId, draft);
  await sendPlain(
    chatId,
    `Editing ${bill.bill_no}. Send a *full replacement* bill text to change items, or Confirm to re-issue same lines as new revision.\n\nExample replacement:\nGuest: ${bill.guest_name}\nVilla: ${bill.villa}\nVeg Dinner x5\nBonfire x1`
  );
}

async function showHistory(chatId, billNo) {
  const bill = await getBillByNo(billNo);
  if (!bill) {
    await sendPlain(chatId, "Bill not found: " + billNo);
    return;
  }
  const versions = await listBillVersions(bill.id);
  const lines = [
    `History for ${bill.bill_no} (current v${bill.version || 1})`,
    `Current total: ₹${Number(bill.grand_total).toLocaleString("en-IN")}`,
    bill.pdf_url ? `Current PDF: ${bill.pdf_url}` : null,
    "",
    versions.length
      ? versions
          .map(
            (v) =>
              `v${v.version} · ${new Date(v.created_at).toLocaleString("en-IN")} · ${v.change_note || "archived"}${
                v.pdf_url ? "\n  " + v.pdf_url : ""
              }`
          )
          .join("\n")
      : "(no prior versions yet)",
  ]
    .filter(Boolean)
    .join("\n");
  await sendPlain(chatId, lines);
}

async function resendPdf(chatId, billNo) {
  const bill = await getBillByNo(billNo);
  if (!bill) {
    await sendPlain(chatId, "Bill not found: " + billNo);
    return;
  }
  const { pdfBuffer, bill: withPdf } = await generateAndStoreInvoicePdf(bill);
  await sendInvoicePdf(chatId, withPdf, pdfBuffer, "Re-generated PDF");
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
    // Always live from Supabase (same as Admin → Menu)
    const catalog = await getCatalog();
    if (!catalog.length) {
      await sendPlain(
        chatId,
        "Menu empty — add items under Owner → Menu on the web portal."
      );
      return;
    }
    const byCat = {};
    for (const item of catalog) {
      byCat[item.category] = byCat[item.category] || [];
      byCat[item.category].push(
        `• ${item.name} — ₹${Number(item.rate_inr).toLocaleString("en-IN")}${
          item.hsn_sac ? ` · HSN ${item.hsn_sac}` : ""
        }`
      );
    }
    const body = Object.entries(byCat)
      .map(([cat, rows]) => `${cat.toUpperCase()}\n${rows.join("\n")}`)
      .join("\n\n");
    await sendPlain(
      chatId,
      `Official menu (live from portal)\nRates match Admin → Menu\n\n${body}\n\nVillas: ${VILLAS.join(", ")}`
    );
    return;
  }

  if (c === "/staff") {
    const staff = await listStaff({ includeInactive: false });
    if (!staff.length) {
      await sendPlain(
        chatId,
        "No staff yet. Owner → Staff on the web portal to add Ravi, Vijay, etc."
      );
      return;
    }
    const lines = staff.map(
      (s) => `• ${s.name}${s.phone ? ` · ${s.phone}` : ""}`
    );
    await sendPlain(
      chatId,
      `Staff roster (live from portal)\n\n${lines.join(
        "\n"
      )}\n\nOn each draft, tap your name before Confirm.`
    );
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
        `${b.bill_no} v${b.version || 1} · ${b.guest_name} · ${b.villa} · ₹${Number(b.grand_total).toLocaleString("en-IN")} · ${b.status}${
          b.created_by ? ` · ${b.created_by}` : ""
        }`
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

  if (c === "/edit") {
    if (!rest[0]) {
      await sendPlain(chatId, "Usage: /edit SB-2026-0003");
      return;
    }
    await startEdit(chatId, rest[0]);
    return;
  }

  if (c === "/history") {
    if (!rest[0]) {
      await sendPlain(chatId, "Usage: /history SB-2026-0003");
      return;
    }
    await showHistory(chatId, rest[0]);
    return;
  }

  if (c === "/pdf") {
    if (!rest[0]) {
      await sendPlain(chatId, "Usage: /pdf SB-2026-0003");
      return;
    }
    await resendPdf(chatId, rest[0]);
    return;
  }

  if (c === "/paid") {
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

  // If currently editing, merge edit metadata into new parse
  const existing = await getDraft(chatId);
  const catalog = await getCatalog();
  const parsed = parseBillText(t, catalog);
  if (!parsed.ok) {
    await sendPlain(chatId, parsed.error);
    return;
  }
  if (existing?.edit_bill_id) {
    parsed.draft.edit_bill_id = existing.edit_bill_id;
    parsed.draft.edit_bill_no = existing.edit_bill_no;
    parsed.draft.edit_version = existing.edit_version;
    parsed.draft.change_note = "Edited via Telegram";
  }
  await previewAndStore(chatId, parsed.draft);
}

async function handlePhoto(chatId, message) {
  await sendPlain(chatId, "Reading the slip with OpenRouter OCR…");
  try {
    if (!hasVisionKey()) {
      await sendPlain(
        chatId,
        "OCR needs OPENROUTER_API_KEY on the server. Type the bill as text for now — /help"
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
    if (message.caption) {
      const cap = parseBillText(message.caption, await getCatalog());
      if (cap.ok) {
        if (cap.draft.guest_name && cap.draft.guest_name !== "Guest") {
          draft.guest_name = cap.draft.guest_name;
        }
        if (cap.draft.villa) draft.villa = cap.draft.villa;
      }
    }
    const existing = await getDraft(chatId);
    if (existing?.edit_bill_id) {
      draft.edit_bill_id = existing.edit_bill_id;
      draft.edit_bill_no = existing.edit_bill_no;
      draft.edit_version = existing.edit_version;
      draft.change_note = "Edited via OCR photo";
    }
    await previewAndStore(chatId, draft);
  } catch (e) {
    await sendPlain(chatId, "OCR failed: " + (e.message || e));
  }
}

export async function handleUpdate(update) {
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
      await answerCallback(cq.id, "Saving…");
      await confirmDraft(chatId);
      return;
    }
    // Staff picker: stf:<id>  (same roster as Admin → Staff)
    if (data.startsWith("stf:")) {
      const staffId = data.slice(4);
      const staffList = await listStaff({ includeInactive: false });
      const person =
        staffList.find((s) => String(s.id) === staffId) ||
        staffList.find(
          (s) => String(s.name).toLowerCase() === String(staffId).toLowerCase()
        );
      const draft = await getDraft(chatId);
      if (!draft) {
        await answerCallback(cq.id, "No draft");
        return;
      }
      if (!person) {
        await answerCallback(cq.id, "Staff not found — /staff");
        return;
      }
      draft.created_by = person.name;
      await answerCallback(cq.id, `Staff: ${person.name}`);
      await previewAndStore(chatId, draft);
      return;
    }
    if (data === "gst:on" || data === "gst:off") {
      const draft = await getDraft(chatId);
      if (!draft) {
        await answerCallback(cq.id, "No draft");
        return;
      }
      draft.gst_applied = data === "gst:on";
      await answerCallback(
        cq.id,
        draft.gst_applied ? "GST ON 5%" : "GST OFF"
      );
      await previewAndStore(chatId, draft);
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
    const editM = data.match(/^edit:(.+)$/);
    if (editM) {
      await answerCallback(cq.id, "Loading…");
      await startEdit(chatId, editM[1]);
      return;
    }
    const histM = data.match(/^hist:(.+)$/);
    if (histM) {
      await answerCallback(cq.id, "History…");
      await showHistory(chatId, histM[1]);
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

  if (message.document?.mime_type?.startsWith("image/")) {
    await sendPlain(chatId, "Reading the image with OpenRouter OCR…");
    try {
      if (!hasVisionKey()) {
        await sendPlain(chatId, "OCR needs OPENROUTER_API_KEY. Type the bill as text.");
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
