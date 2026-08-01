/**
 * Seed Bamboo House inventory from website photo survey.
 * node scripts/seed-bamboo-inventory.mjs
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = fs.readFileSync(path.join(root, ".env.local"), "utf8");
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();
const key =
  env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim() ||
  env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();
const sb = createClient(url, key);

const NOTE =
  "Visual survey from sadhranabagh.com/bamboo-house gallery (downloaded 2026). Unit costs are market estimates only — update when real purchase invoices available.";

function costs(qty, unit, gstPct = 18) {
  const base = Math.round(qty * unit * 100) / 100;
  const gst = Math.round(base * (gstPct / 100) * 100) / 100;
  return {
    qty,
    unit_cost_inr: unit,
    gst_pct: gstPct,
    gst_amount_inr: gst,
    total_cost_inr: Math.round((base + gst) * 100) / 100,
  };
}

// Consolidated list from facade, verandah, living, bedroom, bath, dressing photos
const ITEMS = [
  // Bedroom
  { name: "Double bed with carved wooden headboard", category: "furniture", unit: "pcs", ...costs(1, 55000) },
  { name: "Wooden bedside tables", category: "furniture", unit: "pcs", ...costs(2, 6500) },
  { name: "Wooden table lamps (pleated shade)", category: "furniture", unit: "pcs", ...costs(2, 4500) },
  { name: "Botanical prints (bedroom, framed)", category: "other", unit: "pcs", ...costs(8, 1200) },
  { name: "Printed quilt / bedspread set", category: "linen", unit: "set", ...costs(1, 8500) },
  { name: "Bed pillows (sleep)", category: "linen", unit: "pcs", ...costs(4, 800) },
  { name: "Decorative cushions (bedroom)", category: "linen", unit: "pcs", ...costs(4, 900) },
  { name: "Bedroom area rug", category: "linen", unit: "pcs", ...costs(1, 12000) },
  { name: "Curtains with tree print (bedroom set)", category: "linen", unit: "set", ...costs(1, 6500) },
  { name: "Split AC indoor unit (bedroom)", category: "appliance", unit: "pcs", ...costs(1, 42000) },
  { name: "Cane / wicker lounge chair (bedroom)", category: "furniture", unit: "pcs", ...costs(1, 7500) },

  // Living
  { name: "Teal 3-seater wooden sofa", category: "furniture", unit: "pcs", ...costs(1, 48000) },
  { name: "Teal wooden armchairs", category: "furniture", unit: "pcs", ...costs(2, 16000) },
  { name: "Marble-top coffee table", category: "furniture", unit: "pcs", ...costs(1, 22000) },
  { name: "Wooden side tables (living)", category: "furniture", unit: "pcs", ...costs(2, 5500) },
  { name: "Floor lamp with patterned shade", category: "furniture", unit: "pcs", ...costs(1, 8500) },
  { name: "Wall sconces (living)", category: "appliance", unit: "pcs", ...costs(4, 2500) },
  { name: "Decorative cushions (living)", category: "linen", unit: "pcs", ...costs(6, 900) },
  { name: "Throw blankets / textiles", category: "linen", unit: "pcs", ...costs(2, 2500) },
  { name: "Floor cushions", category: "linen", unit: "pcs", ...costs(2, 1500) },
  { name: "Red patterned area rugs (living)", category: "linen", unit: "pcs", ...costs(2, 9000) },
  { name: "Wooden daybed / bench with cushions", category: "furniture", unit: "pcs", ...costs(1, 28000) },
  { name: "Wooden console / sideboard", category: "furniture", unit: "pcs", ...costs(1, 32000) },
  { name: "Glass-front display cabinet / bookcase", category: "furniture", unit: "pcs", ...costs(1, 35000) },
  { name: "Botanical prints (living, framed)", category: "other", unit: "pcs", ...costs(8, 1200) },
  { name: "Abstract wall painting (framed)", category: "other", unit: "pcs", ...costs(1, 8000) },
  { name: "Indoor potted plant (living)", category: "other", unit: "pcs", ...costs(1, 1500) },
  { name: "Curtains (living / openings)", category: "linen", unit: "set", ...costs(2, 4000) },

  // Dressing / changing
  { name: "Tall wooden wardrobe (dressing)", category: "furniture", unit: "pcs", ...costs(1, 45000) },
  { name: "Wooden dressing console / low cabinet", category: "furniture", unit: "pcs", ...costs(1, 18000) },
  { name: "Folding wooden chair", category: "furniture", unit: "pcs", ...costs(1, 3500) },
  { name: "Wicker laundry basket", category: "other", unit: "pcs", ...costs(1, 1200) },
  { name: "Glass vase (decorative)", category: "glassware", unit: "pcs", ...costs(1, 1800) },

  // Bathroom
  { name: "Carved stone vessel washbasin", category: "other", unit: "pcs", ...costs(1, 25000) },
  { name: "Wooden framed vanity mirror", category: "furniture", unit: "pcs", ...costs(1, 6500) },
  { name: "Guest bathrobes", category: "linen", unit: "pcs", ...costs(2, 1800) },
  { name: "Wooden wall coat hooks (set)", category: "furniture", unit: "set", ...costs(1, 1500) },
  { name: "Bathroom amenity tray + accessories set", category: "other", unit: "set", ...costs(1, 2500) },
  { name: "Bathroom waste bin (enamel)", category: "other", unit: "pcs", ...costs(1, 800) },
  { name: "Bathroom framed artwork", category: "other", unit: "pcs", ...costs(1, 2000) },
  { name: "Bath towels set (est. for 1 suite)", category: "linen", unit: "set", ...costs(2, 1200) },

  // Verandah / outdoor
  { name: "Charpai / woven daybed (verandah)", category: "furniture", unit: "pcs", ...costs(1, 12000) },
  { name: "Cushions (verandah daybed)", category: "linen", unit: "pcs", ...costs(3, 900) },
  { name: "Outdoor dining table (wood)", category: "furniture", unit: "pcs", ...costs(1, 18000) },
  { name: "Outdoor dining chairs", category: "furniture", unit: "pcs", ...costs(4, 4500) },
  { name: "Metal side table (verandah)", category: "furniture", unit: "pcs", ...costs(1, 3500) },
  { name: "Large ceramic / clay garden pots", category: "other", unit: "pcs", ...costs(4, 2500) },
  { name: "Planters with plants (verandah)", category: "other", unit: "pcs", ...costs(4, 800) },
  { name: "Entrance doormat", category: "linen", unit: "pcs", ...costs(1, 600) },

  // Amenities listed for cottage (visible / stated)
  { name: "Bluetooth speaker", category: "appliance", unit: "pcs", ...costs(1, 4500) },
];

const { data: loc, error: locErr } = await sb
  .from("inv_locations")
  .select("id,name")
  .ilike("name", "%Bamboo%")
  .maybeSingle();
if (locErr || !loc) {
  console.error("Bamboo House location missing", locErr?.message);
  process.exit(1);
}
console.log("Location", loc.name, loc.id);

// Clear previous photo-survey seed for this location (notes match) so re-run is clean
const { data: existing } = await sb
  .from("inv_items")
  .select("id,notes")
  .eq("location_id", loc.id);
const toClear = (existing || []).filter((r) =>
  String(r.notes || "").includes("sadhranabagh.com/bamboo-house")
);
if (toClear.length) {
  const ids = toClear.map((r) => r.id);
  await sb.from("inv_items").delete().in("id", ids);
  console.log("Cleared previous survey items", ids.length);
}

const rows = ITEMS.map((it) => ({
  location_id: loc.id,
  name: it.name,
  category: it.category,
  qty: it.qty,
  unit: it.unit,
  unit_cost_inr: it.unit_cost_inr,
  gst_pct: it.gst_pct,
  gst_amount_inr: it.gst_amount_inr,
  total_cost_inr: it.total_cost_inr,
  notes: NOTE,
  active: true,
  created_by: "photo-survey",
  purchase_date: null,
  vendor: "Estimated (website survey)",
}));

const { data, error } = await sb.from("inv_items").insert(rows).select("name,qty,total_cost_inr");
if (error) {
  console.error(error.message);
  process.exit(1);
}
const total = data.reduce((s, r) => s + Number(r.total_cost_inr), 0);
console.log("Inserted", data.length, "items");
console.log(
  "Estimated inventory value (incl. GST): ₹",
  total.toLocaleString("en-IN")
);
fs.writeFileSync(
  path.join(root, "tmp-bamboo-house", "inventory-list.json"),
  JSON.stringify(
    {
      source: "https://www.sadhranabagh.com/bamboo-house",
      location: loc.name,
      location_id: loc.id,
      note: NOTE,
      item_count: data.length,
      estimated_total_inr: total,
      items: data,
    },
    null,
    2
  )
);
console.log("Wrote tmp-bamboo-house/inventory-list.json");
