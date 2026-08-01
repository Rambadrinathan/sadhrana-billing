import { getDayRoster, saveDayAttendance, todayIst } from "@/lib/attendance";
import { summarise } from "@/lib/attendance-roster";
import { isAuthed, getStaffName } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    if (!isAuthed()) {
      return Response.json({ error: "Login required" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || todayIst();
    const entries = await getDayRoster(date);
    return Response.json({ date, entries, summary: summarise(entries) });
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
    const date = body.date || todayIst();
    const res = await saveDayAttendance({
      date,
      entries: body.entries || [],
      markedBy: body.marked_by || getStaffName() || null,
      source: body.source || "web",
    });
    const entries = await getDayRoster(date);
    return Response.json({
      date,
      saved: res.saved,
      entries,
      summary: summarise(entries),
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
