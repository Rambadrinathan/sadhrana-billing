import { checkPin, authCookieHeaders } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json();
    const role = body?.role === "admin" ? "admin" : "staff";
    const displayName = String(body?.name || body?.staff_name || "").trim();
    const ok = checkPin(body?.pin, role);
    if (!ok) {
      if (role === "staff" && checkPin(body?.pin, "admin")) {
        const headers = new Headers({ "Content-Type": "application/json" });
        for (const c of authCookieHeaders(true, "admin", displayName || "Owner")) {
          headers.append("Set-Cookie", c);
        }
        return new Response(JSON.stringify({ ok: true, role: "admin" }), {
          status: 200,
          headers,
        });
      }
      return Response.json({ ok: false, error: "Wrong PIN" }, { status: 401 });
    }
    const headers = new Headers({ "Content-Type": "application/json" });
    for (const c of authCookieHeaders(true, role, displayName)) {
      headers.append("Set-Cookie", c);
    }
    return new Response(JSON.stringify({ ok: true, role, name: displayName }), {
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
