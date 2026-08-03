import {
  sendMessage,
  sendPlain,
  sendRich,
  sendDocument,
  answerCallback,
  editMessageText,
  editMessageReplyMarkup,
  getFile,
  downloadFile,
  confirmKeyboard,
  paidKeyboard,
  HELP_TEXT,
  OPS_HELP,
  isAllowedUser,
  attendanceKeyboard,
  inventoryLocKeyboard,
  purchaseKeyboard,
  purchaseEditKeyboard,
  purchaseLocKeyboard,
  photoIntentKeyboard,
  rosterKeyboard,
  leadSegmentKeyboard,
  leadStayKeyboard,
} from "@/lib/telegram";
import { parseBillText, formatDraftPreview, formatBillMessage } from "@/lib/parse-bill";
import {
  ocrBillFromImage,
  ocrLeadFromImage,
  hasVisionKey,
  notBillMessage,
} from "@/lib/ocr";
import { ocrPurchaseFromImage } from "@/lib/purchase-ocr";
import { storePurchaseFile } from "@/lib/purchase-store";
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
import {
  clockIn,
  clockOut,
  getOpenAttendance,
  listAttendance,
  fmtTime,
} from "@/lib/attendance";
import {
  listLocations,
  listInvItems,
  formatInvSummary,
  inventoryValueByLocation,
  upsertInvItem,
} from "@/lib/inventory";
import { createExpense, listExpenses } from "@/lib/expenses";
import { createExpenseLines } from "@/lib/expense-lines";
import {
  formatLinesReview,
  formatMismatchNote,
  lineMismatch,
  linesTotals,
  parseLineEdit,
  applyLineEdit,
  adoptLinesTotals,
  normalizeLines,
  inr,
  LINE_EDIT_HELP,
} from "@/lib/purchase-lines";
import { upsertGuest, listGuests } from "@/lib/guests";
import { upsertLead, listLeads } from "@/lib/leads";
import { parseLeadTelegramText } from "@/lib/lead-parse-telegram";
import { VILLAS, PROPERTY, estimateStayDeal, RATE_CARD } from "@/lib/config";
import { resolveCommand, unknownCommandMessage } from "@/lib/command-match";
import { stripTaxRows, detectSlipTaxMode } from "@/lib/slip-tax";
import { sendPunchBoard, resolveStaffName } from "@/lib/telegram-punch";

function appUrl() {
  return process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://sadhrana-billing.vercel.app";
}

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/** The one person who raises bills and purchases. */
function billingOperator() {
  return String(process.env.BILLING_OPERATOR || "Munish").trim() || "Munish";
}

/**
 * The amount column on the paper slip is ground truth.
 *
 * Both the vision model and the catalogue matcher can "helpfully" substitute a
 * standard menu rate for the one actually written — "Hi tea 350" became
 * "High Tea 700", which over-billed SB-2026-0015 by 7,717. When qty x rate
 * disagrees with the amount written on that row, trust the written amount and
 * back out the rate from it.
 */
function reconcileRateFromSlip(line) {
  const qty = Number(line.qty) || 0;
  const rate = Number(line.rate_inr) || 0;
  const written = Number(line.written_amount_inr) || 0;
  if (!qty || written <= 0) return line;
  if (Math.abs(qty * rate - written) <= 1) return line;

  const derived = Math.round((written / qty) * 100) / 100;
  if (derived <= 0) return line;
  return {
    ...line,
    rate_inr: derived,
    original_rate_inr: rate,
    rate_from_slip: true,
    catalog_item_id: null, // no longer a menu-priced line
  };
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
        written_amount_inr: l.written_amount_inr || 0,
        row_mismatch: Boolean(l.row_mismatch),
        gst_pct: PROPERTY.defaultGstPct,
        hsn_sac: PROPERTY.defaultHsn,
      };
    }
    const menuRate = Number(matched.rate_inr);
    const readRate = Number(l.rate_inr) || 0;
    // A rate read off a handwritten slip is evidence, not noise. Overwriting it
    // with the menu rate silently re-priced whole bills when the matcher picked
    // the wrong item ("Veg snacks 400" -> "Veg Lunch/Dinner 1200"). Keep what
    // the paper says and surface the disagreement instead.
    const fromPaper = l.from_photo && readRate > 0 && Math.abs(readRate - menuRate) > 1;
    return {
      catalog_item_id: fromPaper ? null : matched.id,
      description: matched.name,
      category: matched.category,
      qty: Number(l.qty) || 1,
      rate_inr: fromPaper ? readRate : menuRate,
      menu_rate_inr: menuRate,
      rate_differs: fromPaper,
      // Must survive: confirmDraft re-enriches, and without this the line
      // looks typed and the menu rate overwrites the slip rate again.
      from_photo: Boolean(l.from_photo),
      written_amount_inr: l.written_amount_inr || 0,
      row_mismatch: Boolean(l.row_mismatch),
      gst_pct: Number(matched.gst_pct) || PROPERTY.defaultGstPct,
      hsn_sac: matched.hsn_sac || PROPERTY.defaultHsn,
    };
  });
  return { ...draft, lines };
}

/**
 * THE bill pipeline. One function, used by both the Telegram preview and the
 * PDF-generating confirm, so the two can never disagree.
 *
 *   1. Match items to the menu (names, HSN, GST%) — but keep the rate written
 *      on the slip; the menu rate is only a default for typed bills.
 *   2. Drop any tax/total row the model mistook for an item.
 *   3. Reconcile each rate against the amount written on that row (paper wins).
 *   4. Decide from the slip's own figures whether tax is already inside the
 *      amounts or must be added on top.
 *
 * Then the invoice is simply: sum of F&B lines -> 5% GST -> grand total.
 */
async function prepareBillDraft(draft) {
  const enriched = await enrichDraftWithCatalog(draft);
  if (enriched.gst_applied === undefined) enriched.gst_applied = true;

  let taxNote = "";
  if (enriched.from_photo) {
    // A "5% GST" or "Total" row read as an item double-taxes the guest
    enriched.lines = stripTaxRows(enriched.lines);
    // Paper wins on price: back the rate out of the written amount
    enriched.lines = (enriched.lines || []).map(reconcileRateFromSlip);

    if (!enriched.gst_manual) {
      const lineSubtotal = (enriched.lines || []).reduce(
        (s, l) => s + (Number(l.qty) || 0) * (Number(l.rate_inr) || 0),
        0
      );
      const mode = detectSlipTaxMode(enriched, lineSubtotal);
      if (mode.applyGst === true) {
        // GST is ALWAYS added on top. The slip is pre-tax; rates stay as written.
        enriched.gst_applied = true;
        enriched.slip_compare_to = mode.compareTo || 0;
        const shown = Number(mode.compareTo || 0).toLocaleString("en-IN");
        taxNote = mode.taxNotOnSlip
          ? `\n🧾 *No tax written on the slip* — its ₹${shown} is the items total. 5% GST added on top.\n`
          : `\n🧾 *Slip lists tax separately* — 5% added on top, as written.\n`;
      }
    }
  }
  return { draft: enriched, taxNote };
}

async function previewAndStore(chatId, draft) {
  // Fresh menu rates every preview
  const { draft: enriched, taxNote } = await prepareBillDraft(draft);

  // Single operator — Munish raises every bill, so there is nothing to pick.
  if (!String(enriched.created_by || "").trim()) {
    enriched.created_by = billingOperator();
  }
  const staffList = [];
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
  const staffNote = `\n👤 *Billed by: ${enriched.created_by}*\n`;

  // Cross-check against the figures written on the paper slip. This is the
  // check that would have caught SB-2026-0015 being ~20,000 short.
  let checkNote = "";
  if (enriched.from_photo) {
    // Compare against the SUBTOTAL, not the grand total. The slip is pre-tax, so
    // our items must equal what the slip totals — then GST goes on top and the
    // invoice is legitimately higher than the paper.
    const written =
      Number(enriched.slip_compare_to) ||
      Number(enriched.written_subtotal_inr) ||
      Number(enriched.written_total_inr) ||
      0;
    const computedSub = Number(totals.subtotal) || 0;
    const grand = Number(totals.grand_total) || 0;
    const badRows = (enriched.lines || []).filter((l) => l.row_mismatch);
    const rateRows = (enriched.lines || []).filter((l) => l.rate_differs);

    if (written > 0 && Math.abs(written - computedSub) > 1) {
      const diff = Math.abs(written - computedSub);
      // Direction matters: over-billing a guest is worse than under-billing
      const dir = computedSub > written ? "OVER by" : "UNDER by";
      checkNote +=
        `\n⚠️ *ITEMS DO NOT MATCH THE SLIP*\n` +
        `Slip items total: *₹${written.toLocaleString("en-IN")}*\n` +
        `This bill's items: *₹${computedSub.toLocaleString("en-IN")}*\n` +
        `*${dir} ₹${diff.toLocaleString("en-IN")}* — check quantities and rates.\n`;
    } else if (written > 0) {
      checkNote +=
        `\n✅ Items match the slip (₹${written.toLocaleString("en-IN")}).` +
        (grand > computedSub
          ? ` GST added → guest pays *₹${grand.toLocaleString("en-IN")}*.\n`
          : `\n`);
    } else {
      checkNote += `\n⚠️ No total was read from the slip — check every line.\n`;
    }

    if (badRows.length) {
      checkNote +=
        `\n⚠️ Qty × rate doesn't equal the written amount on: ` +
        badRows.map((l) => l.description).join(", ") +
        `\n`;
    }
    if (rateRows.length) {
      checkNote +=
        `\nℹ️ Using the rate written on the slip (not the menu rate) for: ` +
        rateRows.map((l) => l.description).join(", ") +
        `\n`;
    }
  }

  const text =
    editNote + staffNote + gstNote + taxNote + checkNote + formatDraftPreview(enriched, totals);
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

/**
 * One clean PDF for WhatsApp share — no Supabase / storage / web links in caption.
 */
async function sendInvoicePdf(chatId, bill, pdfBuffer, extraCaption = "", replyMarkup = null) {
  const fname = `${String(bill.bill_no).replace(/\//g, "-")}-v${bill.version || 1}.pdf`;
  const cap = [
    `Tax Invoice ${bill.bill_no}` +
      (bill.version > 1 ? ` (Rev. ${bill.version})` : ""),
    `${bill.guest_name} · ${bill.villa}`,
    // SB-2026-0017 went out saying "incl. GST" on an invoice with no GST on it
    `Total ₹${Number(bill.grand_total).toLocaleString("en-IN")}` +
      (Number(bill.tax_total) > 0 ? " (incl. GST)" : " (no GST)"),
    "Forward this PDF on WhatsApp to the guest.",
    extraCaption || null,
  ]
    .filter(Boolean)
    .join("\n");
  await sendDocument(chatId, pdfBuffer, fname, cap, {
    reply_markup: replyMarkup || undefined,
  });
}

/**
 * The review card: numbered items, an add-up check against the printed total,
 * then the buttons. Shown after OCR and again after every correction.
 */
async function sendPurchaseReview(chatId, draft) {
  const m = lineMismatch(draft);
  const head =
    `🧾 *Purchase draft*\n` +
    (draft.vendor ? `Vendor: ${draft.vendor}\n` : "") +
    (draft.invoice_no ? `Invoice: ${draft.invoice_no}\n` : "") +
    (draft.invoice_date ? `Date: ${draft.invoice_date}\n` : "") +
    `Taxable Rs ${inr(draft.amount_inr)} · GST Rs ${inr(draft.gst_amount_inr)} · ` +
    `*Total Rs ${inr(draft.total_inr)}*` +
    (draft.total_manual ? " _(corrected)_" : "") +
    "\n";

  const body =
    `\n*Items read from the invoice*\n${formatLinesReview(draft)}\n` +
    formatMismatchNote(draft) +
    (draft.invoice_pdf_url ? "\n📎 Invoice file ready to store.\n" : "");

  const kb = purchaseKeyboard({ showAdopt: m.hasLines && m.mismatch });
  const text = head + body;
  try {
    await sendMessage(chatId, text, { reply_markup: kb });
  } catch {
    await sendPlain(chatId, text.replace(/\*/g, "").replace(/`/g, ""), {
      reply_markup: kb,
    });
  }
}

async function confirmPurchaseDraft(chatId, draft, { toInventory = false, locationId = null } = {}) {
  try {
    const title =
      draft.vendor
        ? `Purchase · ${draft.vendor}`
        : draft.invoice_no
          ? `Purchase · ${draft.invoice_no}`
          : "Purchase invoice";
    const expense = await createExpense({
      title,
      category: draft.suggested_category || "inventory",
      amount_inr: draft.amount_inr || 0,
      gst_amount_inr: draft.gst_amount_inr || 0,
      total_inr: draft.total_inr || 0,
      expense_date: draft.invoice_date || undefined,
      vendor: draft.vendor || null,
      location_id: locationId || draft.location_id || null,
      invoice_pdf_url: draft.invoice_pdf_url || null,
      invoice_pdf_path: draft.invoice_pdf_path || null,
      source: "telegram",
      created_by: draft.created_by || null,
    });

    // Itemised lines — the expense is already saved, so a line failure must not
    // lose the expense. Report honestly instead of swallowing it.
    let lineNote = "";
    const draftLines = normalizeLines(draft.lines);
    if (draftLines.length) {
      try {
        const res = await createExpenseLines(expense.id, draftLines);
        if (res.skipped && res.reason === "table-missing") {
          lineNote =
            `\n⚠️ ${draftLines.length} item(s) NOT saved — run SETUP_EXPENSE_LINES.sql in Supabase.`;
        } else if (res.saved) {
          lineNote = `\n🧾 ${res.saved} item(s) saved.`;
        }
      } catch (e) {
        lineNote = `\n⚠️ Items not saved: ${e.message || e}`;
      }
    }

    let invNote = "";
    if (toInventory && locationId && draftLines.length) {
      let n = 0;
      for (const line of draftLines) {
        await upsertInvItem({
          location_id: locationId,
          name: line.description,
          category: "other",
          qty: line.qty || 1,
          unit_cost_inr: line.unit_cost_inr || 0,
          gst_pct: line.gst_pct || 18,
          vendor: draft.vendor || null,
          purchase_date: draft.invoice_date || null,
          invoice_pdf_url: draft.invoice_pdf_url || null,
          invoice_pdf_path: draft.invoice_pdf_path || null,
          created_by: draft.created_by || null,
        });
        n += 1;
      }
      invNote = `\n📦 ${n} line(s) added to inventory.`;
    }

    await clearDraft(chatId);
    await sendRich(
      chatId,
      `✅ Expense saved: *${title}*\n` +
        `Total ₹${Number(expense.total_inr).toLocaleString("en-IN")}` +
        (expense.invoice_pdf_url ? "\nInvoice file stored." : "") +
        lineNote +
        invNote
    );
  } catch (e) {
    await sendPlain(chatId, "Could not save purchase: " + (e.message || e));
  }
}

/**
 * Parse text into a guest bill draft. Only ever called behind an explicit
 * /bill (or an already-open bill draft) so stray chatter can't mint invoices.
 */
async function startBillFromText(chatId, t) {
  const existing = await getDraft(chatId);
  const catalog = await getCatalog();
  const parsed = parseBillText(t, catalog);
  if (!parsed.ok) {
    if (parsed.error === "NO_BILL_ITEMS" || /priced items/i.test(parsed.error || "")) {
      await sendPlain(
        chatId,
        "I couldn't turn that into a bill (no menu items or amounts found).\n\n" +
          "Send either:\n" +
          "1) A *clear photo of the bill slip*, or\n" +
          "2) Text like this:\n\n" +
          "Guest: Sharma\n" +
          "Villa: Beri House\n" +
          "Bonfire 2000\n" +
          "Veg Dinner x2\n\n" +
          "Tip: one item per line. /menu shows rates. /cancel to stop."
      );
      return;
    }
    await sendPlain(chatId, parsed.error || "Could not read that message.");
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

/** Does this draft mean "a guest bill is in progress"? */
function hasBillIntent(draft) {
  if (!draft) return false;
  if (draft.kind === "await_bill") return true;
  if (draft.edit_bill_id) return true;
  // Bill drafts from previewAndStore carry lines and no `kind`
  return !draft.kind && Array.isArray(draft.lines) && draft.lines.length > 0;
}

async function confirmDraft(chatId) {
  let draft = await getDraft(chatId);
  if (!draft) {
    await sendPlain(chatId, "No draft to confirm. Send a bill as text or photo first.");
    return;
  }

  if (draft.kind === "purchase") {
    await confirmPurchaseDraft(chatId, draft, {
      toInventory: false,
      locationId: draft.location_id || null,
    });
    return;
  }

  // Same pipeline as the preview, so the PDF cannot disagree with what Munish
  // approved. A bare re-enrich here used to re-apply menu rates and silently
  // undo the slip-rate correction (700 instead of 500 on the PDF).
  draft = (await prepareBillDraft(draft)).draft;
  await saveDraft(chatId, draft);

  // No staff gate. There is one operator; blocking the bill to ask who raised
  // it just stopped invoices from being created at all.
  if (!String(draft.created_by || "").trim()) {
    draft.created_by = billingOperator();
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
    const paidKb = paidKeyboard(bill.bill_no);

    try {
      // Single output: PDF + paid buttons (shareable on WhatsApp)
      await sendInvoicePdf(
        chatId,
        bill,
        pdfBuffer,
        draft.edit_bill_id ? "Updated invoice (previous version kept in history)." : null,
        paidKb
      );
    } catch (pdfErr) {
      console.error("pdf send", pdfErr);
      // Fallback: short text + buttons if PDF send fails
      await sendPlain(
        chatId,
        formatBillMessage(bill, appUrl()).replace(/\*/g, "") +
          "\n\n(PDF send failed — open portal if needed.)",
        { reply_markup: paidKb }
      );
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
              `v${v.version} · ${new Date(v.created_at).toLocaleString("en-IN")} · ${v.change_note || "archived"}`
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

async function sendAttendancePicker(chatId) {
  const staff = await listStaff({ includeInactive: false });
  const opens = {};
  for (const s of staff) {
    try {
      const open = await getOpenAttendance(s.name);
      if (open) opens[String(s.name).toLowerCase()] = open;
    } catch {
      /* table missing */
    }
  }
  if (!staff.length) {
    await sendPlain(
      chatId,
      "No staff roster. Add people under Owner → Staff, then /attendance again."
    );
    return;
  }
  await sendPlain(chatId, "⏱ *Attendance* — tap your name:", {
    reply_markup: attendanceKeyboard(staff, opens),
  });
}

async function sendAttendanceToday(chatId) {
  const rows = await listAttendance({ date: todayIst(), limit: 40 });
  if (!rows.length) {
    await sendPlain(chatId, `No attendance punches today (${todayIst()}).`);
    return;
  }
  const lines = rows.map((r) => {
    const out = r.clock_out ? fmtTime(r.clock_out) : "…still in";
    return `• ${r.staff_name}: ${fmtTime(r.clock_in)} → ${out}`;
  });
  await sendPlain(chatId, `⏱ Today ${todayIst()}\n\n${lines.join("\n")}`);
}

function normalizeSelectedVillas(d) {
  if (Array.isArray(d?.villas) && d.villas.length) return [...d.villas];
  if (d?.villa) return [d.villa];
  return [];
}

function formatLeadStaySummary(d) {
  const selected = normalizeSelectedVillas(d);
  const villaLine =
    selected.length > 1
      ? selected.join(" + ")
      : selected[0] || "— none yet (tap rooms below)";
  const dateLine =
    d.check_in && d.check_out
      ? `${d.check_in} → ${d.check_out}`
      : d.preferred_dates || "— dates missing";

  let estBlock = "";
  if (d.check_in && d.check_out && selected.length) {
    const stay = estimateStayDeal({
      villa: selected.length === 1 ? selected[0] : undefined,
      villas: selected,
      check_in: d.check_in,
      check_out: d.check_out,
      peak_period: d.peak_period === true,
    });
    if (stay.nights > 0) {
      estBlock =
        `\n💰 *Estimated rack value: ₹${stay.deal_value_inr.toLocaleString("en-IN")}*` +
        `\n   (${stay.nights} night(s) · room ₹${stay.room_subtotal.toLocaleString("en-IN")}` +
        ` + ${stay.gst_pct}% GST)` +
        `\n   _Estimate only — discounts set later on web._\n`;
    }
  } else if (!selected.length) {
    estBlock = `\n_Tap room(s) below — ✓ marks selection. Does not type into chat._\n`;
  } else {
    estBlock = `\n_Need check-in/out to compute rack estimate._\n`;
  }

  return (
    `📋 *Lead — pick rooms*\n` +
    `Guest: *${d.name || "—"}*\n` +
    `Segment: *${(d.customer_segment || "—").toUpperCase()}*\n` +
    `Dates: ${dateLine}\n` +
    `Rooms selected: *${villaLine}*\n` +
    estBlock +
    `\n✓ / ○ buttons = toggle rooms (multi-OK)\n` +
    `Detected from message are pre-ticked. Tap again to untick.\n` +
    `Then *✅ Save lead with selection*.`
  );
}

/**
 * Parse pasted lead text → draft → Step 1 B2B/B2C buttons (never auto-save).
 */
async function beginLeadWizard(chatId, rawText) {
  const parsed = parseLeadTelegramText(rawText);
  const villas = parsed.villas?.length
    ? parsed.villas
    : parsed.villa
      ? [parsed.villa]
      : [];
  const draft = {
    kind: "lead_draft",
    step: "segment",
    name: parsed.name,
    phone: parsed.phone,
    email: parsed.email,
    notes: parsed.notes,
    preferred_dates: parsed.preferred_dates,
    check_in: parsed.check_in,
    check_out: parsed.check_out,
    villa:
      villas.length > 1
        ? villas.join(" + ")
        : villas[0] || null,
    villas,
    enquiry_type: parsed.enquiry_type || "stay",
    customer_segment: parsed.customer_segment || null,
    source: "telegram",
    raw_paste: String(rawText || "").slice(0, 2000),
  };
  await saveDraft(chatId, draft);

  const villaLine =
    villas.length > 1
      ? villas.join(" + ")
      : villas[0] || "— (will pick on next step)";
  const dateLine =
    draft.check_in && draft.check_out
      ? `${draft.check_in} → ${draft.check_out}`
      : draft.preferred_dates || "— (set dates on web if missing)";

  let dealHint = "";
  if (draft.check_in && draft.check_out && villas.length) {
    const stay = estimateStayDeal({
      villas,
      check_in: draft.check_in,
      check_out: draft.check_out,
    });
    if (stay.nights > 0) {
      dealHint =
        `\n💰 Est. rack (if stay): *₹${stay.deal_value_inr.toLocaleString("en-IN")}*` +
        ` · ${stay.nights}n · +${RATE_CARD.gstPct}% GST\n` +
        `_Estimate only — not final quote; discount later on web._\n`;
    }
  }

  await sendPlain(
    chatId,
    `📋 *Lead draft*\n` +
      `Guest: *${draft.name || "—"}*\n` +
      `Dates: ${dateLine}\n` +
      `Rooms detected: *${villaLine}*\n` +
      dealHint +
      `\n*Step 1 — Tap B2B or B2C* (button only; does not type in chat):\n` +
      (villas.length
        ? `_Rooms from the message will be pre-selected ✓ on the next step._`
        : `_No rooms in message — you'll tick villas next._`),
    { reply_markup: leadSegmentKeyboard(draft.customer_segment) }
  );
}

async function sendInventoryForLocation(chatId, loc) {
  const items = await listInvItems({ locationId: loc.id });
  const sum = formatInvSummary(items);
  if (!items.length) {
    await sendPlain(
      chatId,
      `📦 *${loc.name}*\n\nNo items yet.\nAdd on web: Inventory, or ask owner to enter stock (qty + cost + GST).`
    );
    return;
  }
  const lines = items.slice(0, 25).map((it) => {
    const qty = Number(it.qty);
    const total = Number(it.total_cost_inr || 0).toLocaleString("en-IN");
    return `• ${it.name} × ${qty} · ₹${total}`;
  });
  const more = items.length > 25 ? `\n…+${items.length - 25} more` : "";
  await sendPlain(
    chatId,
    `📦 *${loc.name}*\n${sum.count} items · value ${sum.totalLabel}\n\n${lines.join("\n")}${more}`
  );
}

async function handleCommand(chatId, text) {
  // "/ purchase" (space after the slash) is common on phone keyboards.
  const collapsed = String(text).trim().replace(/^\/+\s+/, "/");
  let [cmd, ...rest] = collapsed.split(/\s+/);

  let resolved = resolveCommand(cmd);
  // "/bi ll" — the word itself got split. Retry with the next token glued on.
  if (
    (resolved.kind === "unknown" || resolved.kind === "suggest") &&
    rest.length
  ) {
    const joined = resolveCommand(cmd + rest[0]);
    if (joined.kind === "exact" || joined.kind === "corrected") {
      resolved = joined;
      rest = rest.slice(1);
    }
  }

  if (resolved.kind === "unknown" || resolved.kind === "suggest") {
    await sendRich(chatId, unknownCommandMessage(resolved));
    return;
  }
  if (resolved.kind === "corrected") {
    await sendRich(
      chatId,
      `_Reading_ */${resolved.typed}* _as_ */${resolved.command}*`
    );
  }
  const c = `/${resolved.command}`;

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

  // Explicit gate for guest bills — nothing is parsed as a bill without this.
  if (c === "/bill") {
    const body = rest.join(" ").trim();
    if (body) {
      await startBillFromText(chatId, text.replace(/^\/bill(@\w+)?\s*/i, ""));
      return;
    }
    await saveDraft(chatId, { kind: "await_bill" });
    await sendRich(
      chatId,
      "🧾 *New guest bill*\n\n" +
        "Send the *photo of the bill slip*, or type the details:\n\n" +
        "Guest: Sharma\n" +
        "Villa: Beri House\n" +
        "Veg Dinner x2\n" +
        "Bonfire 2000\n\n" +
        "/menu shows rates · /cancel to stop."
    );
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

  if (c === "/ops") {
    try {
      await sendMessage(chatId, OPS_HELP);
    } catch {
      await sendPlain(chatId, OPS_HELP.replace(/\*/g, ""));
    }
    return;
  }

  if (c === "/attendance") {
    const sub = (rest[0] || "").toLowerCase();
    if (sub === "today" || sub === "list") {
      await sendAttendanceToday(chatId);
      return;
    }
    if (sub === "punch") {
      // Legacy self-service clock in/out, kept for anyone who relies on it
      await sendAttendancePicker(chatId);
      return;
    }
    await sendPunchBoard(chatId, todayIst());
    return;
  }

  if (c === "/purchase" || c === "/buy") {
    await saveDraft(chatId, { kind: "await_purchase_photo" });
    await sendPlain(
      chatId,
      "📸 Send a *photo of the supplier / purchase invoice* now.\n" +
        "I'll read totals + lines → you confirm expense (and optional inventory).\n" +
        "/cancel to abort."
    );
    return;
  }

  if (c === "/expense") {
    const body = rest.join(" ").trim();
    if (!body) {
      await sendPlain(
        chatId,
        "Usage:\n`/expense Title | amount | gst | category`\n" +
          "Example:\n`/expense Gas cylinder | 1200 | 216 | utilities`\n\n" +
          "Or `/purchase` then photo of invoice."
      );
      return;
    }
    const parts = body.split("|").map((p) => p.trim());
    const title = parts[0] || "Expense";
    const amount = Number(parts[1]) || 0;
    const gst = Number(parts[2]) || 0;
    const category = (parts[3] || "other").toLowerCase();
    try {
      const expense = await createExpense({
        title,
        amount_inr: amount,
        gst_amount_inr: gst,
        total_inr: amount + gst,
        category,
        source: "telegram",
      });
      await sendPlain(
        chatId,
        `✅ Expense: ${expense.title} · ₹${Number(expense.total_inr).toLocaleString("en-IN")}`
      );
    } catch (e) {
      await sendPlain(chatId, "Expense failed: " + (e.message || e));
    }
    return;
  }

  if (c === "/guest") {
    const body = rest.join(" ").trim();
    if (!body) {
      await sendPlain(
        chatId,
        "Usage: `/guest Name | phone | notes`\nExample: `/guest Ms Oberoi | 98xxxxxx | prefers Beri`"
      );
      return;
    }
    const parts = body.split("|").map((p) => p.trim());
    try {
      const g = await upsertGuest({
        name: parts[0],
        phone: parts[1] || null,
        notes: parts[2] || null,
        source: "telegram",
      });
      await sendPlain(
        chatId,
        `✅ Guest saved: *${g.name}*${g.phone ? ` · ${g.phone}` : ""}`
      );
    } catch (e) {
      await sendPlain(chatId, "Guest failed: " + (e.message || e));
    }
    return;
  }

  if (c === "/lead") {
    // Keep newlines for multi-line pastes (Guest Name / Date / Rooms)
    const body = text.replace(/^\/lead(@\w+)?\s*/i, "").trim();
    if (!body) {
      await saveDraft(chatId, {
        kind: "lead_draft",
        name: null,
        step: "await_text",
      });
      await sendPlain(
        chatId,
        "📋 *New lead*\n\n*Reply in this chat* with guest details (paste multi-line OK):\n\n" +
          "```\n" +
          "Guest Name: Mr Anmol Wahi\n" +
          "Date: July 30 to Aug 01, 2026\n" +
          "Number of Rooms: 02 (Library & Bamboo)\n" +
          "```\n\n" +
          "Or just:\n" +
          "```\n" +
          "Anmol Wahi\n" +
          "July 30 to Aug 01, 2026\n" +
          "Library & Bamboo\n" +
          "```\n\n" +
          "Next: *tap buttons* (they do *not* type into the chat box).\n" +
          "Rooms mentioned in the paste are pre-ticked ✓.\n" +
          "You can also send a *screenshot of the email* after /lead.\n\n" +
          "Estimate = domestic CP rack + 18% GST (discount later on web).\n" +
          "One-liner: `/lead Name | phone | stay | b2c | notes` · /cancel to abort."
      );
      return;
    }

    await beginLeadWizard(chatId, body);
    return;
  }

  if (c === "/leads") {
    try {
      const leads = await listLeads({ limit: 15 });
      const open = leads.filter((l) => !["won", "lost"].includes(l.status));
      if (!open.length) {
        await sendPlain(chatId, "No open leads. Add with /lead");
        return;
      }
      const lines = open.map((l) => {
        const seg = (l.customer_segment || "b2c").toUpperCase();
        const val =
          l.estimated_value_inr != null
            ? ` · ₹${Number(l.estimated_value_inr).toLocaleString("en-IN")}`
            : "";
        return `• ${l.name} · ${seg} · ${l.status}${val}`;
      });
      await sendPlain(chatId, `📋 Open enquiries\n\n${lines.join("\n")}`);
    } catch (e) {
      await sendPlain(chatId, "Leads: " + (e.message || e));
    }
    return;
  }

  if (c === "/inventory" || c === "/stock") {
    const sub = (rest.join(" ") || "").toLowerCase().trim();
    if (sub === "value" || sub === "summary") {
      const rows = await inventoryValueByLocation();
      if (!rows.length) {
        await sendPlain(
          chatId,
          "No inventory yet. Add items on the web → Inventory, or run SETUP_OPS.sql for locations."
        );
        return;
      }
      const lines = rows.map(
        (r) =>
          `• ${r.name}: ${r.count} items · ₹${Number(r.total).toLocaleString("en-IN")}`
      );
      const grand = rows.reduce((s, r) => s + Number(r.total), 0);
      await sendPlain(
        chatId,
        `📦 *Inventory value by area*\n\n${lines.join("\n")}\n\n*Total: ₹${grand.toLocaleString("en-IN")}*`
      );
      return;
    }
    if (sub) {
      const locs = await listLocations();
      const loc = locs.find(
        (l) =>
          l.name.toLowerCase().includes(sub) ||
          l.kind.toLowerCase() === sub ||
          sub.includes(l.name.toLowerCase().split(" ")[0])
      );
      if (loc) {
        await sendInventoryForLocation(chatId, loc);
        return;
      }
    }
    const locs = await listLocations();
    await sendPlain(chatId, "📦 Pick an area:", {
      reply_markup: inventoryLocKeyboard(locs),
    });
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

  // A slash command ALWAYS wins over whatever draft is open. This check used to
  // sit below the draft handlers, so typing /attendance while a /purchase line
  // edit was open got parsed as a line-edit instruction and answered with
  // "Didn't understand that."
  if (t.startsWith("/")) {
    await handleCommand(chatId, t);
    return;
  }

  // Free-typed name after tapping "Others"
  const pending = await getDraft(chatId);
  if (pending?.awaiting_other_staff) {
    if (["no", "n", "cancel", "nah", "stop"].includes(lower)) {
      pending.awaiting_other_staff = false;
      await saveDraft(chatId, pending);
      await sendPlain(chatId, "Cancelled. Tap a staff name or Others again.");
      await previewAndStore(chatId, pending);
      return;
    }
    const name = t.slice(0, 40).trim();
    if (name.length < 2) {
      await sendPlain(chatId, "Send a short name (at least 2 letters), or Cancel.");
      return;
    }
    pending.created_by = name;
    pending.awaiting_other_staff = false;
    await saveDraft(chatId, pending);
    await sendPlain(chatId, `Staff set to *${name}*. Confirm the bill when ready.`);
    await previewAndStore(chatId, pending);
    return;
  }

  // Correcting OCR'd purchase items — one instruction per message
  if (pending?.kind === "purchase" && pending.step === "edit_lines") {
    if (["cancel", "stop", "abort"].includes(lower)) {
      await clearDraft(chatId);
      await sendPlain(chatId, "Purchase draft cancelled.");
      return;
    }
    const parsed = parseLineEdit(t);
    if (!parsed.ok) {
      await sendPlain(chatId, parsed.error);
      return;
    }
    if (parsed.action === "done") {
      delete pending.step;
      await saveDraft(chatId, pending);
      await sendPurchaseReview(chatId, pending);
      return;
    }
    const { draft: next, message } = applyLineEdit(pending, parsed);
    next.kind = "purchase";
    next.step = "edit_lines";
    await saveDraft(chatId, next);
    const t2 = linesTotals(next.lines);
    await sendRich(
      chatId,
      `${message}\n\nItems now total *Rs ${inr(t2.total)}* (invoice says Rs ${inr(next.total_inr)}).\n` +
        `Keep editing, or tap *Done*.`,
      { reply_markup: purchaseEditKeyboard() }
    );
    return;
  }

  // /lead with empty body set step=await_text — next message is the paste (multi-line OK)
  if (
    pending?.kind === "lead_draft" &&
    (pending.step === "await_text" ||
      (!pending.name && !pending.customer_segment && pending.step !== "stay"))
  ) {
    if (["no", "n", "cancel", "nah", "stop"].includes(lower)) {
      await clearDraft(chatId);
      await sendPlain(chatId, "Lead cancelled.");
      return;
    }
    await beginLeadWizard(chatId, t);
    return;
  }

  // If segment/stay draft is open, don't treat free text as a bill — nudge buttons
  if (pending?.kind === "lead_draft" && pending.step === "segment") {
    await sendPlain(chatId, "Lead draft open — tap *B2B* or *B2C* below, or /cancel.", {
      reply_markup: leadSegmentKeyboard(),
    });
    return;
  }
  if (pending?.kind === "lead_draft" && (pending.step === "stay" || pending.step === "confirm")) {
    await sendPlain(
      chatId,
      "Lead draft open — pick villa / buyout, or tap ✅ confirm, or /cancel.",
      { reply_markup: leadStayKeyboard() }
    );
    return;
  }

  // A pasted enquiry used to auto-start the lead wizard with no command. That's
  // another way junk gets created, so now we only offer it.
  const looksLikeLeadPaste =
    !t.startsWith("/") &&
    (/\b(guest\s*name|number\s*of\s*rooms|preferred\s*dates?)\b/i.test(t) ||
      (t.includes("\n") &&
        /\b(jan|feb|mar|apr|may|jun|jul|july|aug|sep|oct|nov|dec|\d{4}-\d{2}-\d{2})\b/i.test(
          t
        ) &&
        /\b(library|bamboo|beri|kerala|villa|room|buyout|entire\s*property)\b/i.test(
          t
        )));
  if (looksLikeLeadPaste) {
    await sendRich(
      chatId,
      "That looks like an enquiry — but I won't file it without a command.\n\n" +
        "Send */lead* and paste it again, or ignore this."
    );
    return;
  }

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

  // Typed punches: "in Madan" / "out Madan" / "absent Madan" / "leave Renu"
  const attM = t.trim().match(/^(in|out|absent|leave)\s+(.+)$/i);
  if (attM) {
    const verb = attM[1].toLowerCase();
    const typed = attM[2].trim().slice(0, 40);
    try {
      const { punchIn, punchOut, punchStatus } = await import("@/lib/attendance");
      const staff = await resolveStaffName(typed);
      if (!staff) {
        await sendPlain(
          chatId,
          `No staff member matching "${typed}". Send /attendance to see the list.`
        );
        return;
      }
      const date = todayIst();
      const who = "Telegram";
      let res;
      if (verb === "in") {
        res = await punchIn({
          staffName: staff.name,
          staffId: staff.id,
          date,
          chatId,
          markedBy: who,
        });
      } else if (verb === "out") {
        res = await punchOut({ staffName: staff.name, date, markedBy: who });
      } else {
        res = await punchStatus({
          staffName: staff.name,
          status: verb,
          date,
          markedBy: who,
        });
      }
      await sendPunchBoard(chatId, date, res.message);
    } catch (e) {
      await sendPlain(chatId, "Attendance error: " + (e.message || e));
    }
    return;
  }

  // Casual chat / random text — don't dump a fake invoice example
  const casual =
    /^(hi|hii|hello|hey|ok|okay|thanks|thank you|thx|yes|no|hmm|test|good morning|good evening|gm|bye|👍|🙏)+[!?.]*$/i;
  if (casual.test(t.trim()) || t.trim().length < 3) {
    await sendPlain(
      chatId,
      "Sadhrana bot — billing + ops.\n\n" +
        "• Bill: photo of slip or type guest + items\n" +
        "• /attendance · /inventory · /ops · /help"
    );
    return;
  }

  // GATE: free text is never turned into a bill on its own. Staff must say /bill
  // first (or already have a bill draft open). Stops junk/test invoices.
  const existing = await getDraft(chatId);
  if (!hasBillIntent(existing)) {
    await sendRich(
      chatId,
      "I don't create anything without a command — so nothing was saved.\n\n" +
        "*/bill* — guest F&B bill\n" +
        "*/purchase* — supplier invoice\n" +
        "*/lead* — enquiry\n" +
        "*/expense* · */inventory* · */attendance*\n\n" +
        "/help for everything."
    );
    return;
  }

  await startBillFromText(chatId, t);
}

async function handlePhoto(chatId, message) {
  const existing = await getDraft(chatId);
  const caption = String(message.caption || "").toLowerCase();
  const wantPurchase =
    existing?.kind === "await_purchase_photo" ||
    existing?.kind === "purchase" ||
    /\b(purchase|supplier|expense|inventory|stock|buy)\b/.test(caption);
  const wantLead =
    existing?.kind === "lead_draft" ||
    /\b(lead|enquiry|inquiry|booking request|email)\b/.test(caption) ||
    /^\/lead\b/.test(caption);
  const wantBill = hasBillIntent(existing) || /\b(bill|slip|invoice)\b/.test(caption);

  // GATE: an unexplained photo is not OCR'd into anything. Ask what it is first.
  if (!wantPurchase && !wantLead && !wantBill) {
    const photos = message.photo || [];
    const best = photos[photos.length - 1];
    if (!best?.file_id) {
      await sendPlain(chatId, "Could not open that photo.");
      return;
    }
    await saveDraft(chatId, {
      kind: "photo_pending",
      file_id: best.file_id,
      caption: message.caption || "",
    });
    await sendPlain(
      chatId,
      "📷 Got the photo — what is it? Nothing is saved until you choose.",
      { reply_markup: photoIntentKeyboard() }
    );
    return;
  }

  if (wantLead && !wantPurchase) {
    await sendPlain(chatId, "Reading enquiry screenshot / email…");
    try {
      if (!hasVisionKey()) {
        await sendPlain(
          chatId,
          "Photo reading unavailable. Paste enquiry as text after /lead"
        );
        return;
      }
      const photos = message.photo || [];
      const best = photos[photos.length - 1];
      if (!best?.file_id) {
        await sendPlain(chatId, "Could not open that photo.");
        return;
      }
      const file = await getFile(best.file_id);
      const { buffer, mimeType } = await downloadFile(file.file_path);
      const { paste } = await ocrLeadFromImage(buffer, mimeType);
      const withCaption = [message.caption, paste].filter(Boolean).join("\n");
      await beginLeadWizard(chatId, withCaption.replace(/^\/lead(@\w+)?\s*/i, ""));
    } catch (e) {
      await sendPlain(
        chatId,
        e?.code === "NOT_AN_ENQUIRY"
          ? "That photo doesn't look like an enquiry. Paste text after /lead, or caption the photo with “lead”."
          : "Could not read photo: " + (e.message || e)
      );
    }
    return;
  }

  await sendPlain(
    chatId,
    wantPurchase ? "Analyzing the purchase invoice…" : "Analyzing the bill…"
  );

  // Hoisted so the catch can re-offer the picker with the SAME photo instead of
  // making Munish send it again.
  const heldPhotos = message.photo || [];
  const heldFileId = heldPhotos[heldPhotos.length - 1]?.file_id || null;

  try {
    if (!hasVisionKey()) {
      await sendPlain(
        chatId,
        "Photo reading is not available right now. Type the details as text — /help"
      );
      return;
    }
    const photos = message.photo || [];
    const best = photos[photos.length - 1];
    if (!best?.file_id) {
      await sendPlain(chatId, "Could not open that photo. Please try again.");
      return;
    }
    const file = await getFile(best.file_id);
    const { buffer, mimeType } = await downloadFile(file.file_path);

    if (wantPurchase) {
      const purchase = await ocrPurchaseFromImage(buffer, mimeType);
      const stored = await storePurchaseFile(buffer, {
        filename: `purchase-${Date.now()}.jpg`,
        contentType: mimeType || "image/jpeg",
      });
      const draft = {
        kind: "purchase",
        ...purchase,
        invoice_pdf_url: stored.url,
        invoice_pdf_path: stored.path,
      };
      draft.lines = normalizeLines(draft.lines);
      await saveDraft(chatId, draft);
      await sendPurchaseReview(chatId, draft);
      return;
    }

    const draft = await ocrBillFromImage(buffer, mimeType);
    // Mark these as read off paper so the catalogue keeps the written rate
    draft.lines = (draft.lines || []).map((l) => ({ ...l, from_photo: true }));
    draft.from_photo = true;
    if (message.caption) {
      const cap = parseBillText(message.caption, await getCatalog());
      if (cap.ok) {
        if (cap.draft.guest_name && cap.draft.guest_name !== "Guest") {
          draft.guest_name = cap.draft.guest_name;
        }
        if (cap.draft.villa) draft.villa = cap.draft.villa;
      }
    }
    if (existing?.edit_bill_id) {
      draft.edit_bill_id = existing.edit_bill_id;
      draft.edit_bill_no = existing.edit_bill_no;
      draft.edit_version = existing.edit_version;
      draft.change_note = "Edited via photo";
    }
    await previewAndStore(chatId, draft);
  } catch (e) {
    // Wrong mode chosen (or a stale await_purchase_photo draft sent us down the
    // purchase path). Clear the draft and put the picker BACK with the same
    // photo, so one tap re-routes it. Previously the draft survived, so every
    // later photo went straight to purchase OCR and the picker never returned.
    const wrongMode =
      e?.code === "NOT_PURCHASE" ||
      e?.message === "NOT_PURCHASE" ||
      e?.code === "NOT_A_BILL" ||
      e?.message === "NOT_A_BILL";

    if (wrongMode && heldFileId) {
      const looksLikeBill =
        e?.code === "NOT_PURCHASE" || e?.message === "NOT_PURCHASE";
      await saveDraft(chatId, {
        kind: "photo_pending",
        file_id: heldFileId,
        caption: message.caption || "",
      });
      await sendRich(
        chatId,
        (looksLikeBill
          ? "📷 That isn't a *supplier purchase* invoice.\n"
          : "📷 That doesn't read as a *guest bill*.\n") +
          (e.reason ? `_${e.reason}_\n` : "") +
          "\nSame photo is still here — tap what it actually is:",
        { reply_markup: photoIntentKeyboard() }
      );
      return;
    }
    if (e?.code === "NOT_PURCHASE" || e?.message === "NOT_PURCHASE") {
      await clearDraft(chatId);
      await sendPlain(
        chatId,
        "📷 That doesn't look like a *supplier purchase* invoice.\n" +
          (e.reason ? `What I see: ${e.reason}\n` : "") +
          "Send the photo again and pick what it is."
      );
      return;
    }
    if (e?.code === "NOT_A_BILL" || e?.message === "NOT_A_BILL") {
      await clearDraft(chatId);
      await sendPlain(chatId, notBillMessage(e.reason));
      return;
    }
    await sendPlain(
      chatId,
      "Could not read this photo. Try a clearer picture, or type the details."
    );
  }
}

export async function handleUpdate(update) {
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = cq.message?.chat?.id;
    const userId = cq.from?.id;
    if (!isAllowedUser(userId, chatId)) {
      await answerCallback(cq.id, `Not authorized. Your ID: ${userId}`);
      return;
    }
    const data = cq.data || "";
    if (data === "confirm") {
      await answerCallback(cq.id, "Saving…");
      await confirmDraft(chatId);
      return;
    }
    // Lead wizard: segment → multi-select rooms (✓) → confirm
    if (data.startsWith("leadseg:")) {
      const seg = data.slice(8); // b2b | b2c
      const d = await getDraft(chatId);
      if (!d || d.kind !== "lead_draft") {
        await answerCallback(cq.id, "No lead draft");
        await sendPlain(chatId, "Start again with /lead and paste details.");
        return;
      }
      d.customer_segment = seg === "b2b" ? "b2b" : "b2c";
      d.step = "stay";
      // Keep rooms detected from paste pre-selected
      const selected = normalizeSelectedVillas(d);
      d.villas = selected;
      d.villa =
        selected.length > 1
          ? selected.join(" + ")
          : selected[0] || null;
      await saveDraft(chatId, d);
      await answerCallback(cq.id, `✓ ${seg.toUpperCase()}`);
      // Edit the B2B/B2C message to show ✓ if we can; always send stay picker
      try {
        if (cq.message?.message_id) {
          await editMessageReplyMarkup(
            chatId,
            cq.message.message_id,
            leadSegmentKeyboard(d.customer_segment)
          );
        }
      } catch {
        /* ignore */
      }
      await sendPlain(chatId, formatLeadStaySummary(d), {
        reply_markup: leadStayKeyboard(selected),
      });
      return;
    }
    // Multi-toggle villa selection — updates ✓ on the same keyboard
    if (data.startsWith("leadtoggle:")) {
      const stayId = data.slice("leadtoggle:".length);
      const d = await getDraft(chatId);
      if (!d || d.kind !== "lead_draft") {
        await answerCallback(cq.id, "No draft — /lead again");
        return;
      }
      let selected = normalizeSelectedVillas(d);
      if (stayId === "Entire property") {
        selected = selected.includes("Entire property")
          ? []
          : ["Entire property"];
      } else {
        // clear buyout when picking individual rooms
        selected = selected.filter((v) => v !== "Entire property");
        if (selected.includes(stayId)) {
          selected = selected.filter((v) => v !== stayId);
        } else {
          selected = [...selected, stayId];
        }
      }
      d.villas = selected;
      d.villa =
        selected.length > 1
          ? selected.join(" + ")
          : selected[0] || null;
      d.enquiry_type = "stay";
      d.step = "stay";
      await saveDraft(chatId, d);

      const toast = selected.length
        ? `✓ ${selected.join(" + ")}`
        : "None selected";
      await answerCallback(cq.id, toast);

      const msgId = cq.message?.message_id;
      if (msgId) {
        try {
          await editMessageText(chatId, msgId, formatLeadStaySummary(d), {
            reply_markup: leadStayKeyboard(selected),
          });
        } catch {
          try {
            await editMessageReplyMarkup(
              chatId,
              msgId,
              leadStayKeyboard(selected)
            );
          } catch {
            await sendPlain(chatId, formatLeadStaySummary(d), {
              reply_markup: leadStayKeyboard(selected),
            });
          }
        }
      }
      return;
    }
    // Legacy single-pick (if any old messages still open)
    if (data.startsWith("leadstay:")) {
      const stayId = data.slice(9);
      const d = await getDraft(chatId);
      if (!d || d.kind !== "lead_draft") {
        await answerCallback(cq.id, "No draft");
        return;
      }
      d.villa = stayId;
      d.villas = [stayId];
      d.enquiry_type = "stay";
      d.step = "stay";
      await saveDraft(chatId, d);
      await answerCallback(cq.id, `✓ ${stayId}`);
      await sendPlain(chatId, formatLeadStaySummary(d), {
        reply_markup: leadStayKeyboard([stayId]),
      });
      return;
    }
    if (data === "lead:confirm") {
      await answerCallback(cq.id, "Saving…");
      const d = await getDraft(chatId);
      if (!d || d.kind !== "lead_draft") {
        await sendPlain(chatId, "No lead draft. /lead again.");
        return;
      }
      if (!d.customer_segment) {
        await sendPlain(chatId, "Pick B2B or B2C first.", {
          reply_markup: leadSegmentKeyboard(),
        });
        return;
      }
      const selected = normalizeSelectedVillas(d);
      if (!selected.length && d.enquiry_type === "stay") {
        await sendPlain(
          chatId,
          "Tap at least one room (or entire property) so ✓ appears, then Save.",
          { reply_markup: leadStayKeyboard([]) }
        );
        return;
      }
      try {
        const villaLabel =
          selected.length > 1
            ? selected.join(" + ")
            : selected[0] || d.villa || null;
        const lead = await upsertLead({
          name: d.name || "Guest",
          phone: d.phone || null,
          email: d.email || null,
          notes: d.notes || null,
          preferred_dates: d.preferred_dates || null,
          check_in: d.check_in || null,
          check_out: d.check_out || null,
          villa: villaLabel,
          villas: selected,
          enquiry_type: d.enquiry_type || "stay",
          customer_segment: d.customer_segment,
          status: "new",
          source: "telegram",
          discount_pct: 0,
        });
        await clearDraft(chatId);
        const rack =
          lead.estimated_value_inr != null
            ? Number(lead.estimated_value_inr)
            : lead.deal_value_inr != null
              ? Number(lead.deal_value_inr)
              : null;
        const quoted =
          lead.quoted_value_inr != null
            ? Number(lead.quoted_value_inr)
            : rack;
        await sendPlain(
          chatId,
          `✅ Lead saved: *${lead.name}*\n` +
            `${(lead.customer_segment || "b2c").toUpperCase()} · ${villaLabel || lead.enquiry_type} · ${lead.status}\n` +
            (lead.check_in && lead.check_out
              ? `Dates: ${lead.check_in} → ${lead.check_out}\n`
              : "") +
            (rack != null
              ? `💰 *Estimated rack: ₹${rack.toLocaleString("en-IN")}*\n` +
                `_Not final — set discount & send branded estimate on web._\n`
              : "") +
            (lead.estimate_breakdown ? `\n${lead.estimate_breakdown}\n` : "") +
            `\nView / discount / estimate PDF:\n${appUrl()}/leads`
        );
      } catch (e) {
        await sendPlain(chatId, "Lead failed: " + (e.message || e));
      }
      return;
    }
    if (data === "lead:cancel") {
      await answerCallback(cq.id, "Cancelled");
      await clearDraft(chatId);
      await sendPlain(chatId, "Lead draft cancelled.");
      return;
    }
    // Attendance punches: pn:in:<name> | pn:out:<name> | pn:abs:<name>
    //                      pn:refresh | pn:rest
    if (data.startsWith("pn:")) {
      const [, action, frag] = data.split(":");
      const {
        punchIn,
        punchOut,
        punchStatus,
        markRestAbsent,
      } = await import("@/lib/attendance");
      const date = todayIst();
      const who = cq.from?.first_name || "Telegram";

      try {
        if (action === "refresh") {
          await answerCallback(cq.id, "Refreshed");
          await sendPunchBoard(chatId, date);
          return;
        }
        if (action === "rest") {
          await answerCallback(cq.id, "Marking absent");
          const res = await markRestAbsent({ date, markedBy: who });
          await sendPunchBoard(
            chatId,
            date,
            res.marked
              ? `Marked absent: ${res.names.join(", ")}`
              : "Everyone is already accounted for."
          );
          return;
        }

        const staff = await resolveStaffName(frag);
        if (!staff) {
          await answerCallback(cq.id, "Unknown name");
          await sendPlain(chatId, `Could not match "${frag}" to a staff member.`);
          return;
        }

        let res;
        if (action === "in") {
          res = await punchIn({
            staffName: staff.name,
            staffId: staff.id,
            date,
            source: "telegram",
            chatId,
            markedBy: who,
          });
        } else if (action === "out") {
          res = await punchOut({ staffName: staff.name, date, markedBy: who });
        } else if (action === "abs") {
          res = await punchStatus({
            staffName: staff.name,
            status: "absent",
            date,
            markedBy: who,
          });
        } else {
          await answerCallback(cq.id, "");
          return;
        }

        await answerCallback(cq.id, res.message.slice(0, 60));
        await sendPunchBoard(chatId, date, res.message);
      } catch (e) {
        await answerCallback(cq.id, "Failed");
        await sendPlain(chatId, "Attendance error: " + (e.message || e));
      }
      return;
    }
    // Staff told us what an unexplained photo was — now process it.
    if (data.startsWith("pick:")) {
      const what = data.slice(5);
      const d = await getDraft(chatId);
      if (what === "none") {
        await answerCallback(cq.id, "Ignored");
        await clearDraft(chatId);
        await sendPlain(chatId, "Ignored — nothing saved.");
        return;
      }
      if (!d || d.kind !== "photo_pending" || !d.file_id) {
        await answerCallback(cq.id, "Expired");
        await sendPlain(chatId, "That photo is no longer held. Send it again after /bill, /purchase or /lead.");
        return;
      }
      await answerCallback(cq.id, "Reading…");
      const kinds = {
        bill: "await_bill",
        purchase: "await_purchase_photo",
        lead: "lead_draft",
      };
      await saveDraft(chatId, { kind: kinds[what] || "await_bill" });
      // Re-enter the photo path with the intent now known
      await handlePhoto(chatId, {
        photo: [{ file_id: d.file_id }],
        caption: d.caption || "",
      });
      return;
    }
    if (data === "purch:edit") {
      await answerCallback(cq.id, "Edit items");
      const d = await getDraft(chatId);
      if (!d || d.kind !== "purchase") {
        await sendRich(chatId, "No purchase draft. /purchase then send photo.");
        return;
      }
      d.step = "edit_lines";
      await saveDraft(chatId, d);
      const text = `${formatLinesReview(d)}\n\n${LINE_EDIT_HELP}`;
      try {
        await sendMessage(chatId, text, { reply_markup: purchaseEditKeyboard() });
      } catch {
        await sendPlain(chatId, text.replace(/\*/g, "").replace(/`/g, ""), {
          reply_markup: purchaseEditKeyboard(),
        });
      }
      return;
    }
    if (data === "purch:show") {
      await answerCallback(cq.id, "Items");
      const d = await getDraft(chatId);
      if (!d || d.kind !== "purchase") {
        await sendPlain(chatId, "No purchase draft.");
        return;
      }
      await sendRich(chatId, formatLinesReview(d), {
        reply_markup: purchaseEditKeyboard(),
      });
      return;
    }
    if (data === "purch:review") {
      await answerCallback(cq.id, "Review");
      const d = await getDraft(chatId);
      if (!d || d.kind !== "purchase") {
        await sendPlain(chatId, "No purchase draft.");
        return;
      }
      delete d.step;
      await saveDraft(chatId, d);
      await sendPurchaseReview(chatId, d);
      return;
    }
    if (data === "purch:adopt") {
      await answerCallback(cq.id, "Using items total");
      const d = await getDraft(chatId);
      if (!d || d.kind !== "purchase") {
        await sendRich(chatId, "No purchase draft.");
        return;
      }
      const updated = adoptLinesTotals(d);
      delete updated.step;
      await saveDraft(chatId, updated);
      await sendRich(
        chatId,
        `Totals now taken from the items: taxable Rs ${inr(updated.amount_inr)} + GST Rs ${inr(updated.gst_amount_inr)} = *Rs ${inr(updated.total_inr)}*.`
      );
      await sendPurchaseReview(chatId, updated);
      return;
    }
    if (data === "purch:expense") {
      await answerCallback(cq.id, "Saving…");
      const d = await getDraft(chatId);
      if (!d || d.kind !== "purchase") {
        await sendPlain(chatId, "No purchase draft. /purchase then send photo.");
        return;
      }
      await confirmPurchaseDraft(chatId, d, { toInventory: false });
      return;
    }
    if (data === "purch:inv") {
      await answerCallback(cq.id, "Pick area");
      const d = await getDraft(chatId);
      if (!d || d.kind !== "purchase") {
        await sendPlain(chatId, "No purchase draft.");
        return;
      }
      const locs = await listLocations();
      await sendPlain(
        chatId,
        "Allocate stock lines to which area?",
        { reply_markup: purchaseLocKeyboard(locs) }
      );
      return;
    }
    if (data.startsWith("purchloc:")) {
      const locId = data.slice(9);
      await answerCallback(cq.id, "Saving…");
      const d = await getDraft(chatId);
      if (!d || d.kind !== "purchase") {
        await sendPlain(chatId, "No purchase draft.");
        return;
      }
      await confirmPurchaseDraft(chatId, d, {
        toInventory: true,
        locationId: locId,
      });
      return;
    }
    // Attendance: att:<staffId|name|today|others>
    if (data.startsWith("att:")) {
      const key = data.slice(4);
      if (key === "today") {
        await answerCallback(cq.id, "Today");
        await sendAttendanceToday(chatId);
        return;
      }
      if (key === "others") {
        await answerCallback(cq.id, "Type name");
        await sendPlain(
          chatId,
          "Send: *in YourName* or *out YourName*\nExample: in Munish"
        );
        return;
      }
      if (key === "none") {
        await answerCallback(cq.id, "OK");
        return;
      }
      const staffList = await listStaff({ includeInactive: false });
      const person =
        staffList.find((s) => String(s.id) === key) ||
        staffList.find(
          (s) => String(s.name).toLowerCase() === String(key).toLowerCase()
        );
      if (!person) {
        await answerCallback(cq.id, "Staff not found");
        return;
      }
      try {
        const open = await getOpenAttendance(person.name);
        if (open) {
          const res = await clockOut({ staffName: person.name, chatId });
          await answerCallback(cq.id, "Out");
          await sendPlain(chatId, res.message);
        } else {
          const res = await clockIn({
            staffName: person.name,
            staffId: person.id?.startsWith?.("demo") ? null : person.id,
            chatId,
          });
          await answerCallback(cq.id, "In");
          await sendPlain(chatId, res.message);
        }
      } catch (e) {
        await answerCallback(cq.id, "Error");
        await sendPlain(
          chatId,
          "Attendance needs DB setup. Owner: run SETUP_OPS.sql in Supabase.\n" +
            (e.message || "")
        );
      }
      return;
    }
    // Inventory location: invloc:<uuid>
    if (data.startsWith("invloc:")) {
      const locId = data.slice(7);
      if (locId === "none") {
        await answerCallback(cq.id, "OK");
        return;
      }
      const locs = await listLocations();
      const loc = locs.find((l) => String(l.id) === locId);
      if (!loc) {
        await answerCallback(cq.id, "Not found");
        return;
      }
      await answerCallback(cq.id, loc.name);
      await sendInventoryForLocation(chatId, loc);
      return;
    }
    // Staff picker: stf:<id> or stf:others
    if (data.startsWith("stf:")) {
      const staffId = data.slice(4);
      const draft = await getDraft(chatId);
      if (!draft) {
        await answerCallback(cq.id, "No draft");
        return;
      }

      if (staffId === "others") {
        draft.awaiting_other_staff = true;
        draft.created_by = null;
        await saveDraft(chatId, draft);
        await answerCallback(cq.id, "Type their name");
        await sendPlain(
          chatId,
          "👤 *Others* — send the person’s name in one message (e.g. Sunil).\nThey don’t need to be on the roster.\nReply Cancel to go back."
        );
        return;
      }

      const staffList = await listStaff({ includeInactive: false });
      const person =
        staffList.find((s) => String(s.id) === staffId) ||
        staffList.find(
          (s) => String(s.name).toLowerCase() === String(staffId).toLowerCase()
        );
      if (!person) {
        await answerCallback(cq.id, "Staff not found — /staff");
        return;
      }
      draft.created_by = person.name;
      draft.awaiting_other_staff = false;
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
      // Munish decided by hand — auto tax-mode detection must not override it
      draft.gst_manual = true;
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
    // Show IDs in plain text so non-tech staff can just forward this to owner
    const name = [message.from?.first_name, message.from?.last_name]
      .filter(Boolean)
      .join(" ");
    const isGroup =
      message.chat?.type === "group" || message.chat?.type === "supergroup";
    let msg =
      `Not authorized yet.\n\n` +
      `👤 Your name: ${name || "—"}\n` +
      `🔢 Your Telegram ID:\n${userId}\n\n` +
      `👉 Copy the number above and send it to the owner (Ram).`;
    if (isGroup) {
      msg +=
        `\n\n📍 This group ID (optional — add this once so everyone in the group can bill):\n${chatId}`;
    }
    await sendPlain(chatId, msg);
    return;
  }

  if (message.photo?.length) {
    await handlePhoto(chatId, message);
    return;
  }

  if (message.document?.mime_type?.startsWith("image/")) {
    await sendPlain(chatId, "Analyzing the bill…");
    try {
      if (!hasVisionKey()) {
        await sendPlain(
          chatId,
          "Photo billing is not available right now. Please type the bill as text."
        );
        return;
      }
      const file = await getFile(message.document.file_id);
      const { buffer, mimeType } = await downloadFile(file.file_path);
      const draft = await ocrBillFromImage(
        buffer,
        mimeType || message.document.mime_type
      );
      draft.lines = (draft.lines || []).map((l) => ({ ...l, from_photo: true }));
      draft.from_photo = true;
      await previewAndStore(chatId, draft);
    } catch (e) {
      if (e?.code === "NOT_A_BILL" || e?.message === "NOT_A_BILL") {
        await sendPlain(chatId, notBillMessage(e.reason));
        return;
      }
      await sendPlain(
        chatId,
        "Could not read a bill from this photo. Send a clearer slip photo, or type the bill as text."
      );
    }
    return;
  }

  if (message.text) {
    await handleText(chatId, message.text);
  }
}
