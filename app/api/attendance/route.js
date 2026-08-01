import { listAttendance, clockIn, clockOut } from "@/lib/attendance";
import { isAuthed } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    if (!isAuthed()) {
      return Response.json({ error: "Login required" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || null;
    const rows = await listAttendance({ date, limit: 100 });
    return Response.json({ rows });
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
    const name = String(body.staff_name || "").trim();
    const action = String(body.action || "in").toLowerCase();
    if (!name) {
      return Response.json({ error: "staff_name required" }, { status: 400 });
    }
    if (action === "out") {
      const res = await clockOut({ staffName: name, source: "web" });
      return Response.json(res);
    }
    const res = await clockIn({
      staffName: name,
      staffId: body.staff_id || null,
      source: "web",
    });
    return Response.json(res);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
