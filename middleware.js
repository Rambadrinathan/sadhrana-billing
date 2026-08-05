import { NextResponse } from "next/server";

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Static assets in /public (logo.png etc.) must never hit the login gate
  if (/\.[a-zA-Z0-9]+$/.test(pathname) && !pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const publicBillApi =
    pathname.startsWith("/api/bills/") &&
    (pathname.endsWith("/pdf") ||
      pathname.endsWith("/edit") ||
      pathname.endsWith("/email"));

  // Staff list is readable by authenticated app; GET without auth for login picker optional
  const publicStaffGet =
    pathname === "/api/staff" && request.method === "GET";

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/api/telegram") ||
    publicBillApi ||
    publicStaffGet ||
    pathname.startsWith("/b/") ||
    pathname.startsWith("/invoice/") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const authed = request.cookies.get("sb_staff")?.value === "1";
  if (!authed) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Staff role sees only Bills + Purchases. Everything else is owner territory.
  // Enforced here, not merely hidden in the UI, so a typed URL can't get round it.
  const role = request.cookies.get("sb_role")?.value || "staff";
  if (role !== "admin") {
    const ownerOnly = [
      "/admin",
      "/reports",
      // Month-end shows total revenue, GST and net — owner numbers. Its data API
      // lives under /api/reports and is already owner-only, so leaving the page
      // open to staff would render it and then 403 every figure on it.
      // If Munish should see his own attendance + expenses month view, that wants
      // a separate staff-scoped page WITHOUT the revenue block, not this one.
      "/month",
      "/leads",
      "/guests",
      "/inventory",
      "/api/reports",
      "/api/leads",
      "/api/guests",
      // NOT /attendance or /api/attendance — Munish marks the team's
      // attendance, so staff role must reach both.
      // NOT /api/catalog (bills need menu rates) and NOT /api/inventory
      // (the Purchases page needs the area list for its dropdown).
    ];
    if (ownerOnly.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "Owner access required" },
          { status: 403 }
        );
      }
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "?denied=1";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
