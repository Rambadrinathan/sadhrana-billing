import { NextResponse } from "next/server";

export function middleware(request) {
  const { pathname } = request.nextUrl;

  const publicPdf =
    pathname.startsWith("/api/bills/") && pathname.endsWith("/pdf");

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/api/telegram") ||
    publicPdf ||
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
