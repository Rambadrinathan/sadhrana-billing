import { deleteExpense } from "@/lib/expenses";
import { isAuthed } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function DELETE(_request, { params }) {
  try {
    if (!isAuthed()) {
      return Response.json({ error: "Login required" }, { status: 401 });
    }
    await deleteExpense(params.id);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
