import { getBill } from "@/lib/bills";
import { sendInvoiceEmail } from "@/lib/email-invoice";
import { PROPERTY } from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * POST { to?, email? } — send invoice email (Resend) or return mailto link.
 */
export async function POST(request, { params }) {
  try {
    const { id } = params;
    const body = await request.json().catch(() => ({}));
    const bill = await getBill(id);
    if (!bill) {
      return Response.json({ error: "Bill not found" }, { status: 404 });
    }

    const to = String(body.to || body.email || bill.guest_email || "").trim();
    if (!to) {
      return Response.json(
        { error: "Guest email required (enter email on bill or in request)" },
        { status: 400 }
      );
    }

    const base =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
    const invoiceUrl = base ? `${base.replace(/\/$/, "")}/invoice/${bill.id}` : "";
    const pdfUrl =
      bill.pdf_url ||
      (base ? `${base.replace(/\/$/, "")}/api/bills/${bill.id}/pdf` : "");

    const result = await sendInvoiceEmail({
      to,
      bill,
      pdfUrl,
      invoiceUrl,
    });

    // Persist email on bill if column exists
    if (to && to !== bill.guest_email) {
      try {
        const { getSupabase, isSupabaseConfigured } = await import("@/lib/supabase");
        if (isSupabaseConfigured()) {
          await getSupabase()
            .from("bills")
            .update({ guest_email: to, updated_at: new Date().toISOString() })
            .eq("id", id);
        }
      } catch {
        /* optional */
      }
    }

    return Response.json({
      ok: true,
      mode: result.mode,
      mailto: result.mailto || null,
      from: PROPERTY.email,
    });
  } catch (e) {
    return Response.json({ error: e.message || "Email failed" }, { status: 500 });
  }
}
