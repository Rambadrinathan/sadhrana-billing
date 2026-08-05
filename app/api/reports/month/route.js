import { getMonthReport } from "@/lib/month-report";
import { isAuthed } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/reports/month?month=YYYY-MM — the month-end numbers as JSON. */
export async function GET(request) {
  try {
    if (!isAuthed()) {
      return Response.json({ error: "Login required" }, { status: 401 });
    }
    const p = new URL(request.url).searchParams;
    const month =
      p.get("month") ||
      new Date()
        .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
        .slice(0, 7);
    return Response.json(await getMonthReport(month));
  } catch (e) {
    const isInput = /Month must be/i.test(e.message || "");
    return Response.json({ error: e.message }, { status: isInput ? 400 : 500 });
  }
}
