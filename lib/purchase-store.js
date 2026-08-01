import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

/**
 * Upload purchase invoice image/PDF to storage.
 * Bucket: invoices (reuse) under purchases/
 */
export async function storePurchaseFile(buffer, { filename, contentType = "image/jpeg" } = {}) {
  if (!isSupabaseConfigured()) {
    return { path: null, url: null };
  }
  const admin = getSupabaseAdmin();
  const safe = String(filename || `purchase-${Date.now()}.jpg`).replace(
    /[^\w.-]+/g,
    "-"
  );
  const path = `purchases/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${safe}`;

  const { error } = await admin.storage.from("invoices").upload(path, buffer, {
    contentType,
    upsert: true,
  });
  if (error) {
    console.error("purchase upload", error);
    return { path: null, url: null, error: error.message };
  }
  const { data } = admin.storage.from("invoices").getPublicUrl(path);
  return { path, url: data?.publicUrl || null };
}
