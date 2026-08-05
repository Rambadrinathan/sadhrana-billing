import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

/**
 * Store the SOURCE PAPER for an entry — the photographed voucher, handwritten
 * slip or supplier invoice. This is audit evidence: the entry is a transcription
 * of it, so a saved entry without its paper cannot be checked against anything.
 *
 * Bucket: invoices, under purchases/ (purchases) or bills/ (guest slips).
 *
 * Failures are RETURNED, never swallowed. For over a month this function ate a
 * 415 from storage — the bucket allowed only application/pdf, so every image was
 * rejected — and returned { url: null } as if nothing had happened. Expenses
 * saved cleanly with no paper behind them and nobody could tell. The caller now
 * gets `error` back and tells the operator.
 */
async function storeSourceFile(buffer, { folder, filename, contentType }) {
  if (!isSupabaseConfigured()) {
    return { path: null, url: null, error: "Storage is not configured." };
  }
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (!buf.length) return { path: null, url: null, error: "Empty file." };

  const admin = getSupabaseAdmin();
  const safe = String(filename || `${folder}-${Date.now()}.jpg`).replace(
    /[^\w.-]+/g,
    "-"
  );
  const path = `${folder}/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${safe}`;

  const { error } = await admin.storage.from("invoices").upload(path, buf, {
    contentType: contentType || "image/jpeg",
    upsert: true,
  });
  if (error) {
    console.error(`${folder} source upload failed`, error);
    return { path: null, url: null, error: error.message || String(error) };
  }
  const { data } = admin.storage.from("invoices").getPublicUrl(path);
  return { path, url: data?.publicUrl || null, error: null };
}

/** Purchase voucher / supplier invoice photo. */
export async function storePurchaseFile(
  buffer,
  { filename, contentType = "image/jpeg" } = {}
) {
  return storeSourceFile(buffer, {
    folder: "purchases",
    filename: filename || `purchase-${Date.now()}.jpg`,
    contentType,
  });
}

/** Handwritten guest slip a bill was read from. */
export async function storeBillPhoto(
  buffer,
  { filename, contentType = "image/jpeg" } = {}
) {
  return storeSourceFile(buffer, {
    folder: "bills",
    filename: filename || `slip-${Date.now()}.jpg`,
    contentType,
  });
}
