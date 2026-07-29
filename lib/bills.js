import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

/**
 * @param {Array} lines
 * @param {{ applyGst?: boolean }} opts - when applyGst is false, tax is zeroed
 */
export function computeTotals(lines, opts = {}) {
  const applyGst = opts.applyGst !== false;
  let subtotal = 0;
  let tax_total = 0;
  const computed = lines.map((line, i) => {
    const qty = Number(line.qty) || 0;
    const rate = Number(line.rate_inr) || 0;
    const gst = applyGst ? Number(line.gst_pct) || 0 : 0;
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
      hsn_sac: line.hsn_sac || null,
      line_total: Math.round((base + tax) * 100) / 100,
      sort_order: i,
    };
  });
  return {
    lines: computed,
    subtotal: Math.round(subtotal * 100) / 100,
    tax_total: Math.round(tax_total * 100) / 100,
    grand_total: Math.round((subtotal + tax_total) * 100) / 100,
    gst_applied: applyGst,
  };
}

export async function getCatalog({ includeInactive = false } = {}) {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabase();
  let q = supabase
    .from("catalog_items")
    .select("*")
    .order("sort_order", { ascending: true });
  if (!includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function upsertCatalogItem(item) {
  if (!isSupabaseConfigured()) throw new Error("Supabase not configured");
  const supabase = getSupabase();
  const row = {
    name: String(item.name || "").trim(),
    category: item.category || "other",
    rate_inr: Number(item.rate_inr) || 0,
    gst_pct: Number(item.gst_pct) || 0,
    sort_order: Number(item.sort_order) || 0,
    active: item.active !== false,
    hsn_sac: item.hsn_sac || null,
  };
  if (!row.name) throw new Error("Item name required");

  if (item.id) {
    const { data, error } = await supabase
      .from("catalog_items")
      .update(row)
      .eq("id", item.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase
    .from("catalog_items")
    .insert(row)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function createBill({
  villa,
  guest_name,
  guest_phone = null,
  guest_email = null,
  notes = null,
  lines: rawLines,
  source = "web",
  gst_applied = true,
  created_by = null,
  amount_paid = 0,
}) {
  const villaClean = String(villa || "").trim() || "Other / shared";
  const guestClean = String(guest_name || "").trim();
  if (!guestClean) throw new Error("Guest name is required");
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    throw new Error("Add at least one line item");
  }

  const applyGst = gst_applied !== false;
  const { lines, subtotal, tax_total, grand_total } = computeTotals(rawLines, {
    applyGst,
  });

  const paid = Math.max(0, Number(amount_paid) || 0);
  let status = "unpaid";
  if (paid >= grand_total && grand_total > 0) status = "paid";
  else if (paid > 0) status = "partial";

  if (!isSupabaseConfigured()) {
    return {
      id: "demo-" + Date.now(),
      bill_no: "SB-DEMO-" + String(Date.now()).slice(-4),
      bill_date: new Date().toISOString().slice(0, 10),
      villa: villaClean,
      guest_name: guestClean,
      guest_phone,
      guest_email,
      notes,
      subtotal,
      tax_total,
      grand_total,
      gst_applied: applyGst,
      status,
      amount_paid: paid,
      payment_mode: status === "paid" ? "cash" : null,
      paid_at: status === "paid" ? new Date().toISOString() : null,
      created_by: created_by || null,
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
    gst_applied: applyGst,
    gst_pct: applyGst ? 5 : 0,
    status,
    source,
    created_by: created_by || null,
    amount_paid: paid,
    guest_email: guest_email || null,
  };
  if (status === "paid") {
    insert.payment_mode = "cash";
    insert.paid_at = new Date().toISOString();
  }

  let { data: bill, error: billErr } = await supabase
    .from("bills")
    .insert(insert)
    .select()
    .single();

  // Retry stripping optional columns if schema lag
  if (billErr) {
    const strip = [
      "source",
      "gst_applied",
      "gst_pct",
      "created_by",
      "amount_paid",
      "guest_email",
    ];
    for (const key of strip) {
      if (billErr && new RegExp(key, "i").test(billErr.message || "")) {
        delete insert[key];
        if (key === "amount_paid" && status === "partial") {
          insert.status = "unpaid";
        }
        const retry = await supabase.from("bills").insert(insert).select().single();
        bill = retry.data;
        billErr = retry.error;
      }
    }
  }

  if (billErr) throw new Error(billErr.message);

  let lineRows = lines.map((l) => ({ ...l, bill_id: bill.id }));
  let { data: savedLines, error: lineErr } = await supabase
    .from("bill_lines")
    .insert(lineRows)
    .select();

  if (lineErr && /hsn_sac/i.test(lineErr.message || "")) {
    lineRows = lineRows.map(({ hsn_sac, ...rest }) => rest);
    const retry = await supabase.from("bill_lines").insert(lineRows).select();
    savedLines = retry.data;
    lineErr = retry.error;
  }

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

export async function updateBillStatus(id, { status, payment_mode, payment_amount, payment_notes }) {
  if (!isSupabaseConfigured()) {
    return {
      id,
      status: status || "paid",
      payment_mode,
      amount_paid: payment_amount,
      demo: true,
    };
  }
  const supabase = getSupabase();
  const current = await getBill(id);
  if (!current) throw new Error("Bill not found");

  const patch = { updated_at: new Date().toISOString() };
  const grand = Number(current.grand_total || 0);
  let paid = Number(current.amount_paid || 0);

  if (payment_amount != null && Number(payment_amount) > 0) {
    paid = Math.round((paid + Number(payment_amount)) * 100) / 100;
    patch.amount_paid = paid;
    patch.payment_mode = payment_mode || current.payment_mode || "upi";
    if (payment_notes) patch.payment_notes = payment_notes;
    if (paid >= grand) {
      patch.status = "paid";
      patch.paid_at = new Date().toISOString();
    } else if (paid > 0) {
      patch.status = "partial";
      patch.paid_at = null;
    }
  } else if (status === "paid") {
    patch.status = "paid";
    patch.payment_mode = payment_mode || "upi";
    patch.paid_at = new Date().toISOString();
    patch.amount_paid = grand;
  } else if (status === "void") {
    patch.status = "void";
  } else if (status === "unpaid") {
    patch.status = "unpaid";
    patch.payment_mode = null;
    patch.paid_at = null;
    patch.amount_paid = 0;
  }

  let { data, error } = await supabase
    .from("bills")
    .update(patch)
    .eq("id", id)
    .select("*, bill_lines(*)")
    .single();

  // Schema lag: strip new columns / partial status
  if (error && /amount_paid|partial|payment_notes/i.test(error.message || "")) {
    const fallback = { ...patch };
    delete fallback.amount_paid;
    delete fallback.payment_notes;
    if (fallback.status === "partial") fallback.status = "unpaid";
    const retry = await supabase
      .from("bills")
      .update(fallback)
      .eq("id", id)
      .select("*, bill_lines(*)")
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) throw new Error(error.message);
  return data;
}

export async function listBills({ date, status, limit = 20, q: search } = {}) {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabase();
  let q = supabase
    .from("bills")
    .select("*, bill_lines(*)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (date) q = q.eq("bill_date", date);
  if (status) q = q.eq("status", status);
  if (search && String(search).trim()) {
    const s = String(search).trim().replace(/%/g, "");
    // ilike on bill_no or guest_name
    q = q.or(`bill_no.ilike.%${s}%,guest_name.ilike.%${s}%,villa.ilike.%${s}%`);
  }
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
