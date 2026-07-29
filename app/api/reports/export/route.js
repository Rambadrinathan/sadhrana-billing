import { listBills } from "@/lib/bills";
import { buildReportsWorkbook } from "@/lib/excel-export";
import { PROPERTY } from "@/lib/config";
import { getRole, isAuthed } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/reports/export?from=YYYY-MM-DD&to=YYYY-MM-DD&status=
 * Returns branded .xlsx report for owner.
 */
export async function GET(request) {
  try {
    if (!isAuthed() || getRole() !== "admin") {
      return Response.json({ error: "Owner login required" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";
    const status = searchParams.get("status") || "";

    // Fetch a generous set; filter by date in memory
    let bills = await listBills({
      status: status || undefined,
      limit: 500,
    });

    if (from) {
      bills = bills.filter((b) => String(b.bill_date) >= from);
    }
    if (to) {
      bills = bills.filter((b) => String(b.bill_date) <= to);
    }

    const wb = await buildReportsWorkbook(bills, { from, to });
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    const slug = (PROPERTY.tradeName || "report")
      .replace(/[^\w]+/g, "-")
      .replace(/^-|-$/g, "");
    const fname = `${slug}-billing-report-${from || "all"}-to-${to || "all"}.xlsx`;

    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fname}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("export", e);
    return Response.json({ error: e.message || "Export failed" }, { status: 500 });
  }
}
