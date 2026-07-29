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

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/api/telegram") ||
    publicBillApi ||
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

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
