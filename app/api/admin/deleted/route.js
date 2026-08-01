import { listDeletedBills, restoreBill } from "@/lib/bills";
import { listDeletedExpenses, restoreExpense } from "@/lib/expenses";
import { isAuthed, getRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

function ownerOnly() {
  if (!isAuthed()) return { error: "Login required", status: 401 };
  if (getRole() !== "admin") return { error: "Owner access required", status: 403 };
  return null;
}

export async function GET() {
  const deny = ownerOnly();
  if (deny) return Response.json({ error: deny.error }, { status: deny.status });
  try {
    const [bills, expenses] = await Promise.all([
      listDeletedBills({}),
      listDeletedExpenses({}),
    ]);
    return Response.json({ bills, expenses });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

/** Restore a deleted bill or expense. */
export async function POST(request) {
  const deny = ownerOnly();
  if (deny) return Response.json({ error: deny.error }, { status: deny.status });
  try {
    const { kind, id } = await request.json();
    if (!id) throw new Error("id required");
    if (kind === "bill") return Response.json({ restored: await restoreBill(id) });
    if (kind === "expense")
      return Response.json({ restored: await restoreExpense(id) });
    throw new Error("kind must be bill or expense");
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
