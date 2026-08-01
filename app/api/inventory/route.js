import {
  listLocations,
  listInvItems,
  upsertInvItem,
  inventoryValueByLocation,
} from "@/lib/inventory";
import { isAuthed, getStaffName } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    if (!isAuthed()) {
      return Response.json({ error: "Login required" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    if (searchParams.get("summary") === "1") {
      const byLocation = await inventoryValueByLocation();
      return Response.json({ byLocation });
    }
    const locationId = searchParams.get("location_id") || null;
    const [locations, items] = await Promise.all([
      listLocations(),
      listInvItems({ locationId }),
    ]);
    return Response.json({ locations, items });
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
    const item = await upsertInvItem({
      ...body,
      created_by: body.created_by || getStaffName() || null,
    });
    return Response.json({ item });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
