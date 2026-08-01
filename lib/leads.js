import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { enrichLeadForSave } from "@/lib/lead-estimate";

export const LEAD_STATUSES = ["new", "contacted", "quoted", "won", "lost", "nurture"];
export const LEAD_SEGMENTS = [
  { id: "b2c", label: "B2C — Family / personal" },
  { id: "b2b", label: "B2B — Corporate / group" },
];

export async function listLeads({
  status = null,
  limit = 50,
  from = null,
  to = null,
} = {}) {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabase();
  let q = supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status) q = q.eq("status", status);
  if (from) q = q.gte("created_at", `${from}T00:00:00`);
  if (to) q = q.lte("created_at", `${to}T23:59:59`);
  const { data, error } = await q;
  if (error) {
    if (/could not find the table|leads/i.test(error.message || "")) return [];
    throw new Error(error.message);
  }
  return data || [];
}

export async function upsertLead(item) {
  if (!isSupabaseConfigured()) throw new Error("Database not configured");
  const enriched = await enrichLeadForSave(item);
  const row = {
    name: String(enriched.name || "").trim(),
    phone: enriched.phone || null,
    email: enriched.email || null,
    enquiry_type: enriched.enquiry_type || "stay",
    preferred_dates: enriched.preferred_dates || null,
    pax: enriched.pax != null ? Number(enriched.pax) : null,
    budget_note: enriched.budget_note || null,
    status: enriched.status || "new",
    source: enriched.source || "web",
    assigned_to: enriched.assigned_to || null,
    notes: enriched.notes || null,
    next_follow_up: enriched.next_follow_up || null,
    customer_segment:
      enriched.customer_segment === "b2b" || enriched.customer_segment === "b2c"
        ? enriched.customer_segment
        : "b2c",
    villa: enriched.villa || null,
    check_in: enriched.check_in || null,
    check_out: enriched.check_out || null,
    nights: enriched.nights != null ? Number(enriched.nights) : null,
    rate_per_night_inr:
      enriched.rate_per_night_inr != null
        ? Number(enriched.rate_per_night_inr)
        : null,
    deal_value_inr:
      enriched.deal_value_inr != null
        ? Number(enriched.deal_value_inr)
        : enriched.estimated_value_inr != null
          ? Number(enriched.estimated_value_inr)
          : null,
    estimated_value_inr:
      enriched.estimated_value_inr != null
        ? Number(enriched.estimated_value_inr)
        : enriched.deal_value_inr != null
          ? Number(enriched.deal_value_inr)
          : null,
    estimate_breakdown: enriched.estimate_breakdown || null,
    adults: enriched.adults != null ? Number(enriched.adults) : null,
    kids: enriched.kids != null ? Number(enriched.kids) : null,
    discount_pct:
      enriched.discount_pct != null ? Number(enriched.discount_pct) : 0,
    discount_inr:
      enriched.discount_inr != null ? Number(enriched.discount_inr) : 0,
    quoted_value_inr:
      enriched.quoted_value_inr != null
        ? Number(enriched.quoted_value_inr)
        : enriched.estimated_value_inr != null
          ? Number(enriched.estimated_value_inr)
          : null,
    updated_at: new Date().toISOString(),
  };
  if (!row.name) throw new Error("Name required");
  const supabase = getSupabase();

  const OPTIONAL_COLS =
    /customer_segment|estimated_value|estimate_breakdown|adults|kids|villa|check_in|check_out|nights|rate_per_night|deal_value|discount_pct|discount_inr|quoted_value/i;

  function stripOptional(payload) {
    const p = { ...payload };
    delete p.customer_segment;
    delete p.estimated_value_inr;
    delete p.estimate_breakdown;
    delete p.adults;
    delete p.kids;
    delete p.villa;
    delete p.check_in;
    delete p.check_out;
    delete p.nights;
    delete p.rate_per_night_inr;
    delete p.deal_value_inr;
    delete p.discount_pct;
    delete p.discount_inr;
    delete p.quoted_value_inr;
    return p;
  }

  async function write(mode, id) {
    let payload = { ...row };
    if (mode === "update") {
      let res = await supabase
        .from("leads")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      // Retry without new columns if migration not run yet
      if (res.error && OPTIONAL_COLS.test(res.error.message || "")) {
        // Try drop only discount columns first
        if (/discount|quoted_value/i.test(res.error.message || "")) {
          delete payload.discount_pct;
          delete payload.discount_inr;
          delete payload.quoted_value_inr;
          res = await supabase
            .from("leads")
            .update(payload)
            .eq("id", id)
            .select()
            .single();
        }
        if (res.error && OPTIONAL_COLS.test(res.error.message || "")) {
          payload = stripOptional(payload);
          res = await supabase
            .from("leads")
            .update(payload)
            .eq("id", id)
            .select()
            .single();
        }
      }
      return res;
    }
    let res = await supabase.from("leads").insert(payload).select().single();
    if (res.error && OPTIONAL_COLS.test(res.error.message || "")) {
      if (/discount|quoted_value/i.test(res.error.message || "")) {
        delete payload.discount_pct;
        delete payload.discount_inr;
        delete payload.quoted_value_inr;
        res = await supabase.from("leads").insert(payload).select().single();
      }
      if (res.error && OPTIONAL_COLS.test(res.error.message || "")) {
        payload = stripOptional(payload);
        res = await supabase.from("leads").insert(payload).select().single();
      }
    }
    return res;
  }

  if (enriched.id || item.id) {
    const { data, error } = await write("update", enriched.id || item.id);
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await write("insert");
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteLead(id) {
  if (!isSupabaseConfigured()) throw new Error("Database not configured");
  const leadId = String(id || "").trim();
  if (!leadId) throw new Error("Lead id required");
  const supabase = getSupabase();
  const { error } = await supabase.from("leads").delete().eq("id", leadId);
  if (error) throw new Error(error.message);
  return { ok: true };
}
