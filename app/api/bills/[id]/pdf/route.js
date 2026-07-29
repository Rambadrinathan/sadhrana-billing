import { getBill } from "@/lib/bills";
import { generateAndStoreInvoicePdf } from "@/lib/invoice-store";

export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  try {
    const bill = await getBill(params.id);
    if (!bill) {
      return new Response("Not found", { status: 404 });
    }
    // Prefer stored PDF if present
    if (bill.pdf_url) {
      try {
        const remote = await fetch(bill.pdf_url);
        if (remote.ok) {
          const buf = Buffer.from(await remote.arrayBuffer());
          const fname = `${String(bill.bill_no).replace(/\//g, "-")}-v${bill.version || 1}.pdf`;
          return new Response(buf, {
            status: 200,
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `inline; filename="${fname}"`,
              "Cache-Control": "private, max-age=60",
            },
          });
        }
      } catch {
        /* regenerate */
      }
    }
    const { pdfBuffer } = await generateAndStoreInvoicePdf(bill);
    const fname = `${String(bill.bill_no).replace(/\//g, "-")}-v${bill.version || 1}.pdf`;
    return new Response(pdfBuffer, {
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
