import { checkPin, authCookieHeaders } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json();
    const role = body?.role === "admin" ? "admin" : "staff";
    const ok = checkPin(body?.pin, role);
    if (!ok) {
      // If admin login failed, try staff pin only for staff role
      if (role === "staff" && checkPin(body?.pin, "admin")) {
        // admin pin can open staff too
        const headers = new Headers({ "Content-Type": "application/json" });
        for (const c of authCookieHeaders(true, "admin")) {
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
    for (const c of authCookieHeaders(true, role)) {
      headers.append("Set-Cookie", c);
    }
    return new Response(JSON.stringify({ ok: true, role }), {
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
