import { getBill } from "@/lib/bills";
import { buildInvoicePdf } from "@/lib/invoice-pdf";

export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  try {
    const bill = await getBill(params.id);
    if (!bill) {
      return new Response("Not found", { status: 404 });
    }
    const buf = await buildInvoicePdf(bill);
    const fname = `${String(bill.bill_no).replace(/\//g, "-")}.pdf`;
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fname}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
