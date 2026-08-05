import { deleteExpense, updateExpense, getExpense } from "@/lib/expenses";
import { isAuthed, getStaffName } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  try {
    if (!isAuthed()) {
      return Response.json({ error: "Login required" }, { status: 401 });
    }
    const expense = await getExpense(params.id);
    if (!expense) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(expense);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

/** Edit a purchase's own fields. Any logged-in user may edit — one person runs
 *  this estate, and locking him out of his own corrections is not a safeguard. */
export async function PATCH(request, { params }) {
  try {
    if (!isAuthed()) {
      return Response.json({ error: "Login required" }, { status: 401 });
    }
    const body = await request.json();
    const expense = await updateExpense(params.id, body || {});
    return Response.json({ ok: true, expense });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}

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
