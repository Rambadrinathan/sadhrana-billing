import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export function computeTotals(lines) {
  let subtotal = 0;
  let tax_total = 0;
  const computed = lines.map((line, i) => {
    const qty = Number(line.qty) || 0;
    const rate = Number(line.rate_inr) || 0;
    const gst = Number(line.gst_pct) || 0;
    const base = qty * rate;
    const tax = (base * gst) / 100;
    subtotal += base;
    tax_total += tax;
    return {
      catalog_item_id: line.catalog_item_id || null,
      description: String(line.description || "").trim(),
      category: line.category || "other",
      qty,
      rate_inr: rate,
      gst_pct: gst,
      line_total: Math.round((base + tax) * 100) / 100,
      sort_order: i,
    };
  });
  return {
    lines: computed,
    subtotal: Math.round(subtotal * 100) / 100,
    tax_total: Math.round(tax_total * 100) / 100,
    grand_total: Math.round((subtotal + tax_total) * 100) / 100,
  };
}

export async function getCatalog() {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("catalog_items")
    .select("*")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function createBill({
  villa,
  guest_name,
  guest_phone = null,
  notes = null,
  lines: rawLines,
  source = "web",
}) {
  const villaClean = String(villa || "").trim() || "Other / shared";
  const guestClean = String(guest_name || "").trim();
  if (!guestClean) throw new Error("Guest name is required");
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    throw new Error("Add at least one line item");
  }

  const { lines, subtotal, tax_total, grand_total } = computeTotals(rawLines);

  if (!isSupabaseConfigured()) {
    return {
      id: "demo-" + Date.now(),
      bill_no: "SB-DEMO-" + String(Date.now()).slice(-4),
      bill_date: new Date().toISOString().slice(0, 10),
      villa: villaClean,
      guest_name: guestClean,
      guest_phone,
      notes,
      subtotal,
      tax_total,
      grand_total,
      status: "unpaid",
      payment_mode: null,
      paid_at: null,
      source,
      bill_lines: lines.map((l, i) => ({ ...l, id: "dl-" + i })),
      demo: true,
    };
  }

  const supabase = getSupabase();
  const { data: billNo, error: billNoErr } = await supabase.rpc("next_bill_no");
  if (billNoErr) throw new Error("Could not allocate bill number: " + billNoErr.message);

  const insert = {
    bill_no: billNo,
    villa: villaClean,
    guest_name: guestClean,
    guest_phone,
    notes,
    subtotal,
    tax_total,
    grand_total,
    status: "unpaid",
  };

  // source column optional until migration
  try {
    insert.source = source;
  } catch {
    /* ignore */
  }

  let { data: bill, error: billErr } = await supabase
    .from("bills")
    .insert(insert)
    .select()
    .single();

  // Retry without source if column missing
  if (billErr && /source/i.test(billErr.message)) {
    delete insert.source;
    const retry = await supabase.from("bills").insert(insert).select().single();
    bill = retry.data;
    billErr = retry.error;
  }

  if (billErr) throw new Error(billErr.message);

  const lineRows = lines.map((l) => ({ ...l, bill_id: bill.id }));
  const { data: savedLines, error: lineErr } = await supabase
    .from("bill_lines")
    .insert(lineRows)
    .select();

  if (lineErr) {
    await supabase.from("bills").delete().eq("id", bill.id);
    throw new Error(lineErr.message);
  }

  return { ...bill, bill_lines: savedLines || [] };
}

export async function getBill(id) {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("bills")
    .select("*, bill_lines(*)")
    .eq("id", id)
    .single();
  if (error) return null;
  if (data?.bill_lines) {
    data.bill_lines.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }
  return data;
}

export async function getBillByNo(billNo) {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("bills")
    .select("*, bill_lines(*)")
    .eq("bill_no", billNo)
    .single();
  if (error) return null;
  if (data?.bill_lines) {
    data.bill_lines.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }
  return data;
}

export async function updateBillStatus(id, { status, payment_mode }) {
  if (!isSupabaseConfigured()) {
    return { id, status, payment_mode, demo: true };
  }
  const supabase = getSupabase();
  const patch = { updated_at: new Date().toISOString() };
  if (status === "paid") {
    patch.status = "paid";
    patch.payment_mode = payment_mode || "upi";
    patch.paid_at = new Date().toISOString();
  } else if (status === "void") {
    patch.status = "void";
  } else if (status === "unpaid") {
    patch.status = "unpaid";
    patch.payment_mode = null;
    patch.paid_at = null;
  }
  const { data, error } = await supabase
    .from("bills")
    .update(patch)
    .eq("id", id)
    .select("*, bill_lines(*)")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listBills({ date, status, limit = 20 } = {}) {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabase();
  let q = supabase
    .from("bills")
    .select("*, bill_lines(*)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (date) q = q.eq("bill_date", date);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

/** Match free-text / OCR item names against catalog (name + aliases). */
export function matchCatalogItem(name, catalog) {
  const n = normalizeName(name);
  if (!n) return null;

  let best = null;
  let bestScore = 0;
  for (const item of catalog || []) {
    const candidates = [
      item.name,
      ...((item.aliases && Array.isArray(item.aliases) ? item.aliases : []) || []),
    ];
    for (const cand of candidates) {
      const iname = normalizeName(cand);
      if (!iname) continue;
      if (iname === n) return item;
      if (iname.includes(n) || n.includes(iname)) {
        const score = Math.min(n.length, iname.length) / Math.max(n.length, iname.length) + 0.2;
        if (score > bestScore) {
          bestScore = score;
          best = item;
        }
      }
      const nt = new Set(n.split(" ").filter((t) => t.length > 1));
      const it = iname.split(" ").filter((t) => t.length > 1);
      const hit = it.filter((t) => nt.has(t) || [...nt].some((x) => x.startsWith(t) || t.startsWith(x)));
      if (hit.length >= 1) {
        const score = hit.length / Math.max(it.length, 1) + 0.15;
        if (score > bestScore) {
          bestScore = score;
          best = item;
        }
      }
    }
  }
  return bestScore >= 0.35 ? best : null;
}

function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
