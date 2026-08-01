import { listExpenses, createExpense } from "@/lib/expenses";
import { isAuthed, getStaffName } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    if (!isAuthed()) {
      return Response.json({ error: "Login required" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const rows = await listExpenses({
      limit: Number(searchParams.get("limit") || 80),
      from: searchParams.get("from") || null,
      to: searchParams.get("to") || null,
    });
    return Response.json({ expenses: rows });
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
    const expense = await createExpense({
      ...body,
      created_by: body.created_by || getStaffName() || null,
      source: body.source || "web",
    });
    return Response.json({ expense });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
