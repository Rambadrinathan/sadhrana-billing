import {
  createBill,
  getCatalog,
  listBills,
  matchCatalogItem,
} from "@/lib/bills";
import { PROPERTY } from "@/lib/config";

export const dynamic = "force-dynamic";

/** Lock rates to official menu when description matches catalog. */
async function enforceMenuRates(rawLines) {
  const catalog = await getCatalog();
  return (rawLines || []).map((l) => {
    const matched =
      (l.catalog_item_id && catalog.find((c) => c.id === l.catalog_item_id)) ||
      matchCatalogItem(l.description, catalog);

    if (matched) {
      return {
        catalog_item_id: matched.id,
        description: matched.name,
        category: matched.category,
        qty: Number(l.qty) || 1,
        rate_inr: Number(matched.rate_inr),
        gst_pct: Number(matched.gst_pct) || PROPERTY.defaultGstPct,
      };
    }

    return {
      catalog_item_id: null,
      description: String(l.description || "Item").trim(),
      category: l.category || "other",
      qty: Number(l.qty) || 1,
      rate_inr: Number(l.rate_inr) || 0,
      gst_pct:
        Number(l.gst_pct) > 0 ? Number(l.gst_pct) : PROPERTY.defaultGstPct,
    };
  });
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const status = searchParams.get("status");
    const limit = Number(searchParams.get("limit") || 50);
    const bills = await listBills({ date, status, limit });
    return Response.json({ bills });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const villa = String(body.villa || "").trim();
    const guest_name = String(body.guest_name || "").trim();
    const guest_phone = body.guest_phone ? String(body.guest_phone).trim() : null;
    const notes = body.notes ? String(body.notes).trim() : null;
    const rawLines = Array.isArray(body.lines) ? body.lines : [];

    if (!villa || !guest_name) {
      return Response.json({ error: "Villa and guest name are required" }, { status: 400 });
    }
    if (rawLines.length === 0) {
      return Response.json({ error: "Add at least one item" }, { status: 400 });
    }

    const lines = await enforceMenuRates(rawLines);
    const bill = await createBill({
      villa,
      guest_name,
      guest_phone,
      notes,
      lines,
      source: body.source || "web",
    });

    return Response.json({ bill });
  } catch (e) {
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
