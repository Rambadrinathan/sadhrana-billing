import { listExpenseLines, replaceExpenseLines } from "@/lib/expense-lines";
import { linesTotals, normalizeLines } from "@/lib/purchase-lines";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { isAuthed } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  try {
    if (!isAuthed()) {
      return Response.json({ error: "Login required" }, { status: 401 });
    }
    const lines = await listExpenseLines(params.id);
    return Response.json({ lines, totals: linesTotals(lines) });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

/**
 * Replace the itemised lines for an expense, then re-sync the parent totals so
 * the expense and its items can never disagree.
 */
export async function PUT(request, { params }) {
  try {
    if (!isAuthed()) {
      return Response.json({ error: "Login required" }, { status: 401 });
    }
    const body = await request.json();
    const incoming = normalizeLines(body.lines).filter((l) => l.description);
    await replaceExpenseLines(params.id, incoming);

    const totals = linesTotals(incoming);
    if (body.sync_total !== false && isSupabaseConfigured()) {
      const supabase = getSupabase();
      const { error } = await supabase
        .from("expenses")
        .update({
          amount_inr: totals.subtotal,
          gst_amount_inr: totals.gst,
          total_inr: totals.total,
        })
        .eq("id", params.id);
      if (error) throw new Error(error.message);
    }

    const lines = await listExpenseLines(params.id);
    return Response.json({ lines, totals });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
