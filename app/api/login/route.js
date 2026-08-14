import { checkPin, authCookieHeaders, hasDistinctAdminPin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json();
    const asked = body?.role === "admin" ? "admin" : "staff";
    const displayName = String(body?.name || body?.staff_name || "").trim();

    // The owner's PIN identifies the owner, whichever way the toggle is set.
    // Without this, typing the admin PIN while the form sits on its default
    // "Staff" setting logs you in successfully AS STAFF — and the middleware
    // then bounces you off /admin, which reads as "the PIN is not working".
    // Only safe while the two PINs are distinct: if ADMIN_PIN is unset it
    // falls back to MANAGER_PIN, and promoting then would make every staff
    // login an owner login.
    const adminPin = hasDistinctAdminPin() && checkPin(body?.pin, "admin");
    const role = adminPin ? "admin" : asked;

    if (!adminPin && !checkPin(body?.pin, role)) {
      return Response.json({ ok: false, error: "Wrong PIN" }, { status: 401 });
    }
    const name = role === "admin" ? displayName || "Owner" : displayName;
    const headers = new Headers({ "Content-Type": "application/json" });
    for (const c of authCookieHeaders(true, role, name)) {
      headers.append("Set-Cookie", c);
    }
    return new Response(JSON.stringify({ ok: true, role, name }), {
      status: 200,
      headers,
    });
  } catch {
    return Response.json({ ok: false, error: "Bad request" }, { status: 400 });
  }
}

export async function DELETE() {
  const headers = new Headers({ "Content-Type": "application/json" });
  for (const c of authCookieHeaders(false)) {
    headers.append("Set-Cookie", c);
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

/** GET — current session name/role for client */
export async function GET() {
  const { getRole, getStaffName, isAuthed } = await import("@/lib/auth");
  if (!isAuthed()) {
    return Response.json({ ok: false }, { status: 401 });
  }
  return Response.json({
    ok: true,
    role: getRole(),
    name: getStaffName(),
  });
}
