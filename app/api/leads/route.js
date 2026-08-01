import { listLeads, upsertLead, deleteLead, LEAD_STATUSES } from "@/lib/leads";
import { isAuthed, getStaffName } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    if (!isAuthed()) {
      return Response.json({ error: "Login required" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const leads = await listLeads({
      status: searchParams.get("status") || null,
      limit: Number(searchParams.get("limit") || 80),
      from: searchParams.get("from") || null,
      to: searchParams.get("to") || null,
    });
    return Response.json({ leads, statuses: LEAD_STATUSES });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    if (!isAuthed()) {
      return Response.json({ error: "Login required" }, { status: 401 });
    }
    const body = await request.json();
    const lead = await upsertLead({
      ...body,
      assigned_to: body.assigned_to || getStaffName() || null,
      source: body.source || "web",
    });
    return Response.json({ lead });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

/** DELETE /api/leads?id=uuid */
export async function DELETE(request) {
  try {
    if (!isAuthed()) {
      return Response.json({ error: "Login required" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return Response.json({ error: "id required" }, { status: 400 });
    }
    await deleteLead(id);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
