import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return Response.json({ items: DEMO_CATALOG, demo: true });
  }
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("catalog_items")
    .select("*")
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ items: data || [] });
}

const DEMO_CATALOG = [
  { id: "d1", name: "Breakfast (per person)", category: "fnb", rate_inr: 650, gst_pct: 5, sort_order: 10 },
  { id: "d2", name: "Lunch (per person)", category: "fnb", rate_inr: 950, gst_pct: 5, sort_order: 20 },
  { id: "d3", name: "Dinner (per person)", category: "fnb", rate_inr: 1100, gst_pct: 5, sort_order: 30 },
  { id: "d4", name: "High tea / snacks", category: "fnb", rate_inr: 450, gst_pct: 5, sort_order: 40 },
  { id: "d5", name: "Soft drinks / juice", category: "fnb", rate_inr: 150, gst_pct: 5, sort_order: 50 },
  { id: "d6", name: "Tea / coffee", category: "fnb", rate_inr: 80, gst_pct: 5, sort_order: 60 },
  { id: "d7", name: "Barbecue setup", category: "fnb", rate_inr: 2500, gst_pct: 5, sort_order: 70 },
  { id: "d8", name: "Bonfire", category: "experience", rate_inr: 2000, gst_pct: 18, sort_order: 100 },
  { id: "d9", name: "Massage (60 min)", category: "experience", rate_inr: 2500, gst_pct: 18, sort_order: 110 },
  { id: "d10", name: "Massage (90 min)", category: "experience", rate_inr: 3500, gst_pct: 18, sort_order: 120 },
];
