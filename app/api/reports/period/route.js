import { getPeriodReport, todayIst } from "@/lib/period-report";
import { isAuthed } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/reports/period?from=YYYY-MM-DD&to=YYYY-MM-DD
 * GET /api/reports/period?month=YYYY-MM
 *
 * Readable by staff as well as the owner. That is deliberate and was the
 * owner's explicit instruction: the supervisor runs the property day to day and
 * cannot do that without seeing what came in and what went out. The GST detail
 * that only the accountant needs lives on the owner-only month view instead.
 */
export async function GET(request) {
  try {
    if (!isAuthed()) {
      return Response.json({ error: "Login required" }, { status: 401 });
    }
    const p = new URL(request.url).searchParams;
    const month = p.get("month");
    const from = month || p.get("from") || todayIst().slice(0, 7);
    const to = month ? null : p.get("to");
    return Response.json(await getPeriodReport(from, to));
  } catch (e) {
    const isInput = /must be|before the start/i.test(e.message || "");
    return Response.json({ error: e.message }, { status: isInput ? 400 : 500 });
  }
}
