import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export const INV_CATEGORIES = [
  { id: "linen", label: "Linen / beds / pillows" },
  { id: "crockery", label: "Crockery / plates" },
  { id: "glassware", label: "Glassware" },
  { id: "furniture", label: "Furniture" },
  { id: "appliance", label: "Appliances" },
  { id: "other", label: "Other" },
];

function money(n) {
  return Number(n || 0);
}

export function computeInvCosts({ qty, unit_cost_inr, gst_pct }) {
  const q = money(qty);
  const unit = money(unit_cost_inr);
  const gstP = money(gst_pct);
  const base = Math.round(q * unit * 100) / 100;
  const gst_amount_inr = Math.round(base * (gstP / 100) * 100) / 100;
  const total_cost_inr = Math.round((base + gst_amount_inr) * 100) / 100;
  return { gst_amount_inr, total_cost_inr, base };
}

export async function listLocations({ includeInactive = false } = {}) {
  if (!isSupabaseConfigured()) {
    return [
      { id: "demo-kitchen", name: "Kitchen", kind: "kitchen", sort_order: 60, active: true },
      { id: "demo-dining", name: "Dining", kind: "dining", sort_order: 50, active: true },
      { id: "demo-beri", name: "Beri House", kind: "room", sort_order: 20, active: true },
    ];
  }
  const supabase = getSupabase();
  let q = supabase
    .from("inv_locations")
    .select("*")
    .order("sort_order", { ascending: true });
  if (!includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) {
    if (/could not find the table|inv_locations/i.test(error.message || "")) return [];
    throw new Error(error.message);
  }
  return data || [];
}

export async function listInvItems({ locationId = null, includeInactive = false } = {}) {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabase();
  let q = supabase
    .from("inv_items")
    .select("*, inv_locations(id, name, kind)")
    .order("name", { ascending: true });
  if (!includeInactive) q = q.eq("active", true);
  if (locationId) q = q.eq("location_id", locationId);
  const { data, error } = await q;
  if (error) {
    if (/could not find the table|inv_items/i.test(error.message || "")) return [];
    throw new Error(error.message);
  }
  return data || [];
}

export async function upsertInvItem(item) {
  if (!isSupabaseConfigured()) throw new Error("Database not configured");
  const costs = computeInvCosts({
    qty: item.qty,
    unit_cost_inr: item.unit_cost_inr,
    gst_pct: item.gst_pct,
  });
  const row = {
    location_id: item.location_id || null,
    name: String(item.name || "").trim(),
    category: item.category || "other",
    qty: money(item.qty),
    unit: item.unit || "pcs",
    unit_cost_inr: money(item.unit_cost_inr),
    gst_pct: money(item.gst_pct),
    gst_amount_inr: costs.gst_amount_inr,
    total_cost_inr: costs.total_cost_inr,
    purchase_date: item.purchase_date || null,
    vendor: item.vendor || null,
    notes: item.notes || null,
    invoice_pdf_url: item.invoice_pdf_url || null,
    invoice_pdf_path: item.invoice_pdf_path || null,
    active: item.active !== false,
    created_by: item.created_by || null,
    updated_at: new Date().toISOString(),
  };
  if (!row.name) throw new Error("Item name required");

  const supabase = getSupabase();
  if (item.id) {
    const { data, error } = await supabase
      .from("inv_items")
      .update(row)
      .eq("id", item.id)
      .select("*, inv_locations(id, name, kind)")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase
    .from("inv_items")
    .insert(row)
    .select("*, inv_locations(id, name, kind)")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function inventoryValueByLocation() {
  const items = await listInvItems({ includeInactive: false });
  const map = new Map();
  for (const it of items) {
    const locName = it.inv_locations?.name || "Unassigned";
    const locId = it.location_id || "none";
    if (!map.has(locId)) {
      map.set(locId, { location_id: locId, name: locName, total: 0, count: 0 });
    }
    const row = map.get(locId);
    row.total += money(it.total_cost_inr);
    row.count += 1;
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export function formatInvSummary(items) {
  const total = items.reduce((s, i) => s + money(i.total_cost_inr), 0);
  return {
    count: items.length,
    total,
    totalLabel: total.toLocaleString("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }),
  };
}
