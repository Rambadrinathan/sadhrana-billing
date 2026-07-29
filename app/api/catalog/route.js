import {
  getCatalog,
  upsertCatalogItem,
} from "@/lib/bills";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { getRole, isAuthed } from "@/lib/auth";
import { PROPERTY } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const all = searchParams.get("all") === "1";
    if (!isSupabaseConfigured()) {
      return Response.json({ items: DEMO_CATALOG, demo: true });
    }
    const items = await getCatalog({ includeInactive: all });
    return Response.json({ items });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

/** Create or update catalog item (owner). */
export async function POST(request) {
  try {
    if (!isAuthed() || getRole() !== "admin") {
      return Response.json({ error: "Owner login required" }, { status: 401 });
    }
    const body = await request.json();
    if (!isSupabaseConfigured()) {
      return Response.json({ error: "Demo mode — cannot save catalog" }, { status: 400 });
    }
    const item = await upsertCatalogItem({
      id: body.id || undefined,
      name: body.name,
      category: body.category || "other",
      rate_inr: body.rate_inr,
      gst_pct: body.gst_pct ?? PROPERTY.defaultGstPct,
      sort_order: body.sort_order ?? 0,
      active: body.active !== false,
      hsn_sac: body.hsn_sac || PROPERTY.defaultHsn,
    });
    return Response.json({ item });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

/** Soft-delete / deactivate */
export async function DELETE(request) {
  try {
    if (!isAuthed() || getRole() !== "admin") {
      return Response.json({ error: "Owner login required" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return Response.json({ error: "id required" }, { status: 400 });
    if (!isSupabaseConfigured()) {
      return Response.json({ error: "Demo mode" }, { status: 400 });
    }
    const supabase = getSupabase();
    const { error } = await supabase
      .from("catalog_items")
      .update({ active: false })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

const DEMO_CATALOG = [
  {
    id: "d1",
    name: "Breakfast (per person)",
    category: "fnb",
    rate_inr: 650,
    gst_pct: 5,
    sort_order: 10,
    hsn_sac: "996331",
  },
  {
    id: "d2",
    name: "Lunch (per person)",
    category: "fnb",
    rate_inr: 950,
    gst_pct: 5,
    sort_order: 20,
    hsn_sac: "996331",
  },
  {
    id: "d3",
    name: "Dinner (per person)",
    category: "fnb",
    rate_inr: 1100,
    gst_pct: 5,
    sort_order: 30,
    hsn_sac: "996331",
  },
  {
    id: "d4",
    name: "High tea / snacks",
    category: "fnb",
    rate_inr: 450,
    gst_pct: 5,
    sort_order: 40,
    hsn_sac: "996331",
  },
  {
    id: "d5",
    name: "Soft drinks / juice",
    category: "fnb",
    rate_inr: 150,
    gst_pct: 5,
    sort_order: 50,
    hsn_sac: "996331",
  },
  {
    id: "d6",
    name: "Tea / coffee",
    category: "fnb",
    rate_inr: 80,
    gst_pct: 5,
    sort_order: 60,
    hsn_sac: "996331",
  },
  {
    id: "d7",
    name: "Barbecue setup",
    category: "fnb",
    rate_inr: 2500,
    gst_pct: 5,
    sort_order: 70,
    hsn_sac: "996331",
  },
  {
    id: "d8",
    name: "Bonfire",
    category: "experience",
    rate_inr: 2000,
    gst_pct: 18,
    sort_order: 100,
    hsn_sac: "999799",
  },
  {
    id: "d9",
    name: "Massage (60 min)",
    category: "experience",
    rate_inr: 2500,
    gst_pct: 18,
    sort_order: 110,
    hsn_sac: "999722",
  },
  {
    id: "d10",
    name: "Massage (90 min)",
    category: "experience",
    rate_inr: 3500,
    gst_pct: 18,
    sort_order: 120,
    hsn_sac: "999722",
  },
];
