import { checkPin, authCookieHeader } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json();
    const ok = checkPin(body?.pin);
    if (!ok) {
      return Response.json({ ok: false, error: "Wrong PIN" }, { status: 401 });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": authCookieHeader(true),
      },
    });
  } catch {
    return Response.json({ ok: false, error: "Bad request" }, { status: 400 });
  }
}

export async function DELETE() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": authCookieHeader(false),
    },
  });
}
