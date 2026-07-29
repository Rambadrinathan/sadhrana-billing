import { editBill, listBillVersions } from "@/lib/invoice-store";
import { getCatalog, matchCatalogItem } from "@/lib/bills";
import { PROPERTY } from "@/lib/config";

export const dynamic = "force-dynamic";

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
      gst_pct: Number(l.gst_pct) > 0 ? Number(l.gst_pct) : PROPERTY.defaultGstPct,
    };
  });
}

/** PATCH — edit invoice; archives previous version + regenerates PDF */
export async function PATCH(request, { params }) {
  try {
    const body = await request.json();
    const lines = body.lines ? await enforceMenuRates(body.lines) : undefined;
    const result = await editBill(params.id, {
      villa: body.villa,
      guest_name: body.guest_name,
      guest_phone: body.guest_phone,
      notes: body.notes,
      lines,
      change_note: body.change_note || "Edited via API",
    });
    return Response.json({
      bill: result.bill,
      pdf_url: result.pdfUrl,
      version: result.bill.version,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}

/** GET versions history */
export async function GET(_request, { params }) {
  try {
    const versions = await listBillVersions(params.id);
    return Response.json({ versions });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
