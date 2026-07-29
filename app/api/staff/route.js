import { listStaff, upsertStaff, deactivateStaff } from "@/lib/staff";
import { getRole, isAuthed } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET — active staff for pickers; ?all=1 for admin roster */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const all = searchParams.get("all") === "1";
    const staff = await listStaff({ includeInactive: all });
    return Response.json({ staff });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

/** POST — create/update staff (owner) */
export async function POST(request) {
  try {
    if (!isAuthed() || getRole() !== "admin") {
      return Response.json({ error: "Owner login required" }, { status: 401 });
    }
    const body = await request.json();
    const item = await upsertStaff({
      id: body.id || undefined,
      name: body.name,
      phone: body.phone,
      active: body.active !== false,
      sort_order: body.sort_order ?? 0,
    });
    return Response.json({ staff: item });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

/** DELETE — deactivate staff */
export async function DELETE(request) {
  try {
    if (!isAuthed() || getRole() !== "admin") {
      return Response.json({ error: "Owner login required" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return Response.json({ error: "id required" }, { status: 400 });
    await deactivateStaff(id);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
