import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { buildInvoicePdf } from "@/lib/invoice-pdf";
import { getBill } from "@/lib/bills";

/**
 * Generate PDF with logo, upload to Supabase Storage, update bill row.
 * Returns { bill, pdfBuffer, pdfPath, pdfUrl }
 */
export async function generateAndStoreInvoicePdf(bill, { changeNote } = {}) {
  const pdfBuffer = await buildInvoicePdf(bill);
  const version = Number(bill.version) || 1;
  const safeNo = String(bill.bill_no || bill.id).replace(/[^\w.-]+/g, "-");
  const path = `${bill.id}/v${version}-${safeNo}.pdf`;

  let pdfUrl = null;
  let pdfPath = null;

  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin();
    const { error: upErr } = await admin.storage
      .from("invoices")
      .upload(path, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (upErr) {
      console.error("storage upload", upErr);
      // still return buffer so Telegram can send it
    } else {
      pdfPath = path;
      const { data } = admin.storage.from("invoices").getPublicUrl(path);
      pdfUrl = data?.publicUrl || null;

      await admin
        .from("bills")
        .update({
          pdf_path: pdfPath,
          pdf_url: pdfUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", bill.id);
    }
  }

  return {
    bill: { ...bill, pdf_path: pdfPath, pdf_url: pdfUrl, version },
    pdfBuffer,
    pdfPath,
    pdfUrl,
    changeNote,
  };
}

/**
 * Snapshot current bill into invoice_versions before an edit.
 */
export async function archiveBillVersion(bill, changeNote) {
  if (!isSupabaseConfigured() || !bill?.id) return;
  const admin = getSupabaseAdmin();
  const version = Number(bill.version) || 1;
  const snapshot = {
    bill_no: bill.bill_no,
    bill_date: bill.bill_date,
    villa: bill.villa,
    guest_name: bill.guest_name,
    guest_phone: bill.guest_phone,
    notes: bill.notes,
    subtotal: bill.subtotal,
    tax_total: bill.tax_total,
    grand_total: bill.grand_total,
    card_fee_pct: bill.card_fee_pct,
    card_fee_inr: bill.card_fee_inr,
    status: bill.status,
    payment_mode: bill.payment_mode,
    bill_lines: bill.bill_lines || [],
    pdf_path: bill.pdf_path,
    pdf_url: bill.pdf_url,
  };

  const { error } = await admin.from("invoice_versions").upsert(
    {
      bill_id: bill.id,
      version,
      bill_no: bill.bill_no,
      snapshot,
      pdf_path: bill.pdf_path || null,
      pdf_url: bill.pdf_url || null,
      change_note: changeNote || `Version ${version} archived before edit`,
    },
    { onConflict: "bill_id,version" }
  );
  if (error) throw new Error("Could not archive version: " + error.message);
}

/**
 * Replace bill lines/header after archiving previous version. Regenerates PDF.
 */
export async function editBill(billId, patch) {
  const current = await getBill(billId);
  if (!current) throw new Error("Bill not found");
  if (current.status === "void") throw new Error("Cannot edit a void bill");

  await archiveBillVersion(current, patch.change_note || "Edited");

  const { computeTotals } = await import("@/lib/bills");
  const villa = patch.villa != null ? String(patch.villa).trim() : current.villa;
  const guest_name =
    patch.guest_name != null ? String(patch.guest_name).trim() : current.guest_name;
  const guest_phone =
    patch.guest_phone !== undefined ? patch.guest_phone : current.guest_phone;
  const notes = patch.notes !== undefined ? patch.notes : current.notes;
  const applyGst =
    patch.gst_applied !== undefined
      ? patch.gst_applied !== false
      : current.gst_applied !== false;
  // Tax-inclusive is a property of the bill, not of one edit: re-saving a v2
  // must not quietly add 5% on top of amounts that already contain it.
  const inclusive =
    applyGst &&
    (patch.gst_inclusive !== undefined
      ? patch.gst_inclusive === true
      : current.gst_inclusive === true);

  // Whether the guest is paying by card is a property of the bill too, so an
  // edit that only changes an item must not silently drop the fee — or add one
  // the guest never agreed to. Absent from the patch means "leave it as it is".
  const { PROPERTY } = await import("@/lib/config");
  const cardFee =
    patch.card_fee !== undefined
      ? patch.card_fee === true
      : Number(current.card_fee_inr) > 0;
  const cardFeePct = cardFee
    ? Number(current.card_fee_pct) > 0
      ? Number(current.card_fee_pct)
      : PROPERTY.cardFeePct
    : 0;

  let lines = current.bill_lines || [];
  if (Array.isArray(patch.lines) && patch.lines.length) {
    lines = patch.lines;
  }

  const {
    lines: normLines,
    subtotal,
    tax_total,
    grand_total,
    card_fee_inr,
  } = computeTotals(
    lines.map((l) => ({
      catalog_item_id: l.catalog_item_id,
      description: l.description,
      category: l.category,
      qty: l.qty,
      rate_inr: l.rate_inr,
      gst_pct: l.gst_pct,
    })),
    // Lines already stored on the bill are net of tax, so an untouched edit
    // must NOT divide them again. Only a caller handing in fresh, gross lines
    // (the Telegram draft) asks for the back-out.
    {
      applyGst,
      inclusive: Array.isArray(patch.lines) && patch.lines.length ? inclusive : false,
      // Recomputed from the NEW grand total: edit the items and the fee follows.
      cardFeePct,
    }
  );

  const nextVersion = (Number(current.version) || 1) + 1;
  const admin = getSupabaseAdmin();

  // Replace line items
  await admin.from("bill_lines").delete().eq("bill_id", billId);
  const lineRows = normLines.map((l) => ({ ...l, bill_id: billId }));
  const { error: lineErr } = await admin.from("bill_lines").insert(lineRows);
  if (lineErr) throw new Error(lineErr.message);

  // Buyer GSTIN on edit — same rules as createBill. Explicit null clears a
  // company booking; undefined leaves the existing buyer block alone.
  let buyerPatch = {};
  if (
    patch.buyer_gstin !== undefined ||
    patch.buyer_company !== undefined ||
    patch.buyer_address !== undefined
  ) {
    const { validateGstin } = await import("@/lib/gstin");
    const gst = validateGstin(
      patch.buyer_gstin !== undefined ? patch.buyer_gstin : current.buyer_gstin
    );
    if (!gst.ok) throw new Error(gst.error);
    const buyerGstin = gst.gstin || null;
    const buyerCompany =
      patch.buyer_company !== undefined
        ? String(patch.buyer_company || "").trim() || null
        : current.buyer_company || null;
    if (buyerGstin && !buyerCompany) {
      throw new Error(
        "A GSTIN needs the company name too — that name is who the invoice is billed to."
      );
    }
    buyerPatch = {
      buyer_company: buyerCompany,
      buyer_gstin: buyerGstin,
      buyer_address:
        patch.buyer_address !== undefined
          ? String(patch.buyer_address || "").trim() || null
          : current.buyer_address || null,
      buyer_state_name: buyerGstin ? gst.stateName : null,
      buyer_state_code: buyerGstin ? gst.stateCode : null,
    };
  }

  const billPatch = {
    villa,
    guest_name,
    guest_phone,
    notes,
    subtotal,
    tax_total,
    grand_total,
    gst_applied: applyGst,
    gst_inclusive: inclusive,
    gst_pct: applyGst ? 5 : 0,
    card_fee_pct: cardFeePct,
    card_fee_inr,
    version: nextVersion,
    updated_at: new Date().toISOString(),
    ...buyerPatch,
  };
  let { data: updated, error: billErr } = await admin
    .from("bills")
    .update(billPatch)
    .eq("id", billId)
    .select("*, bill_lines(*)")
    .single();

  // Same schema-lag guard createBill uses: a database that has not had the
  // gst_inclusive migration applied yet must still be able to edit a bill,
  // rather than failing every edit on an unknown column.
  if (billErr && /gst_inclusive|card_fee/i.test(billErr.message || "")) {
    delete billPatch.gst_inclusive;
    delete billPatch.card_fee_pct;
    delete billPatch.card_fee_inr;
    ({ data: updated, error: billErr } = await admin
      .from("bills")
      .update(billPatch)
      .eq("id", billId)
      .select("*, bill_lines(*)")
      .single());
  }

  if (billErr) throw new Error(billErr.message);
  if (updated?.bill_lines) {
    updated.bill_lines.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }

  return generateAndStoreInvoicePdf(updated, {
    changeNote: patch.change_note || `Edited to v${nextVersion}`,
  });
}

export async function listBillVersions(billId) {
  if (!isSupabaseConfigured()) return [];
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("invoice_versions")
    .select("id, bill_id, version, bill_no, pdf_url, change_note, created_at, snapshot")
    .eq("bill_id", billId)
    .order("version", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}
