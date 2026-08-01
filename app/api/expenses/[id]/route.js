import { deleteExpense } from "@/lib/expenses";
import { isAuthed, getStaffName } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function DELETE(request, { params }) {
  try {
    if (!isAuthed()) {
      return Response.json({ error: "Login required" }, { status: 401 });
    }
    let reason = null;
    try {
      const body = await request.json();
      reason = body?.reason || null;
    } catch {
      /* no body is fine */
    }
    const res = await deleteExpense(params.id, {
      deletedBy: getStaffName() || null,
      reason,
    });
    return Response.json(res);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
