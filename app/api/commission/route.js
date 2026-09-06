import { isAuthed, getStaffName } from "@/lib/auth";
import { createCommissionPayout, splitInclusiveGst } from "@/lib/commission";
import { COMMISSION_GST_PCT } from "@/lib/config";

export const dynamic = "force-dynamic";

/** Preview inclusive → taxable/GST split without saving. */
export async function GET(request) {
  try {
    if (!isAuthed()) {
      return Response.json({ error: "Login required" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const total = Number(searchParams.get("amount") || 0);
    const gstPct = Number(searchParams.get("gst_pct") || COMMISSION_GST_PCT);
    return Response.json({ split: splitInclusiveGst(total, gstPct) });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

/**
 * Create a commission payout (expense + line). PDF via GET /api/expenses/[id]/pdf
 */
export async function POST(request) {
  try {
    if (!isAuthed()) {
      return Response.json({ error: "Login required" }, { status: 401 });
    }
    const body = await request.json();
    const result = await createCommissionPayout({
      payee: body.payee || body.vendor,
      city: body.city || null,
      amountInclusive: body.amount_inclusive ?? body.total_inr,
      gstPct: body.gst_pct ?? COMMISSION_GST_PCT,
      note: body.note || body.description || "Commission",
      expense_date: body.expense_date || null,
      created_by: body.created_by || getStaffName() || null,
      source: body.source || "web",
      vendor_gstin: body.vendor_gstin || null,
    });
    return Response.json({
      expense: result.expense,
      split: result.split,
      pdf_url: `/api/expenses/${result.expense.id}/pdf`,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
