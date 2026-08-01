import { listLeads } from "@/lib/leads";
import { enrichLeadForSave } from "@/lib/lead-estimate";
import { buildEstimatePdf } from "@/lib/estimate-pdf";
import { isAuthed } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
// Chromium needs Node runtime (not Edge)
export const runtime = "nodejs";

/** GET /api/leads/[id]/estimate — branded A4 estimate PDF from HTML template */
export async function GET(_request, { params }) {
  try {
    if (!isAuthed()) {
      return Response.json({ error: "Login required" }, { status: 401 });
    }
    const id = params?.id;
    if (!id) {
      return Response.json({ error: "id required" }, { status: 400 });
    }
    const leads = await listLeads({ limit: 200 });
    const lead = leads.find((l) => String(l.id) === String(id));
    if (!lead) {
      return Response.json({ error: "Lead not found" }, { status: 404 });
    }
    // Compute rack + discount for PDF without writing
    const fresh = await enrichLeadForSave(lead);
    const pdf = await buildEstimatePdf(fresh || lead);
    const safeName = String(lead.name || "guest")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .slice(0, 40)
      .replace(/\s+/g, "-");
    return new Response(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Estimate-${safeName || "lead"}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("estimate pdf", e);
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}
