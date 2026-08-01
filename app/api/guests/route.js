import { listGuests, upsertGuest } from "@/lib/guests";
import { isAuthed } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    if (!isAuthed()) {
      return Response.json({ error: "Login required" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const guests = await listGuests({
      q: searchParams.get("q") || "",
      limit: Number(searchParams.get("limit") || 100),
    });
    return Response.json({ guests });
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
    const guest = await upsertGuest(body);
    return Response.json({ guest });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
