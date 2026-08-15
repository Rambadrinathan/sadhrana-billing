import {
  listPayments,
  createPayment,
  updatePayment,
  deletePayment,
} from "@/lib/staff-payments";
import { isAuthed, getStaffName } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Wage payments. Readable and writable by staff as well as the owner —
 * the supervisor is the one who physically hands the money over, so if he
 * cannot record it here he will record it nowhere.
 */

export async function GET(request) {
  if (!isAuthed()) return Response.json({ error: "Login required" }, { status: 401 });
  try {
    const p = new URL(request.url).searchParams;
    return Response.json({
      payments: await listPayments({ from: p.get("from"), to: p.get("to") }),
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  if (!isAuthed()) return Response.json({ error: "Login required" }, { status: 401 });
  try {
    const body = await request.json();
    const payment = await createPayment(body, { createdBy: getStaffName() || null });
    return Response.json({ payment });
  } catch (e) {
    // A validation message is for the person holding the phone to act on, so
    // it comes back as 400 with the sentence, not a 500 with a stack trace.
    return Response.json({ error: e.message }, { status: 400 });
  }
}

export async function PATCH(request) {
  if (!isAuthed()) return Response.json({ error: "Login required" }, { status: 401 });
  try {
    const body = await request.json();
    const payment = await updatePayment(body.id, body);
    return Response.json({ payment });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}

export async function DELETE(request) {
  if (!isAuthed()) return Response.json({ error: "Login required" }, { status: 401 });
  try {
    const id = new URL(request.url).searchParams.get("id");
    return Response.json(
      await deletePayment(id, { deletedBy: getStaffName() || null })
    );
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
