import { NextResponse, type NextRequest } from "next/server";

/**
 * Penjaga lapis pertama: memastikan cookie sesi ada sebelum halaman dirender.
 * Validasi sebenarnya (idle timeout, user aktif, token valid) dilakukan di server
 * melalui getSession() pada layout dashboard dan route API.
 */
const PROTECTED_PREFIXES = [
  "/orders",
  "/deadline",
  "/monthly-review",
  "/history",
  "/notifications",
  "/profile",
  "/analysis",
];

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const needsAuth = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!needsAuth) return NextResponse.next();

  const hasSession = request.cookies.has("ipms_session");
  if (hasSession) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "?reason=expired";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|logo-instaprint.png).*)"],
};
