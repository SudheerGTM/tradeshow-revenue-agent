import { NextRequest, NextResponse } from "next/server";
import { resolveTenantSlug } from "@/lib/tenant";

// Tenant slug is resolved here and forwarded as a header + cookie.
// The actual DB lookup (inactive-tenant block) happens in server components
// and API routes, where DB access is safe.
export function proxy(req: NextRequest) {
  const hostname = req.headers.get("host") ?? "localhost";
  const slug = resolveTenantSlug(hostname);

  const requestHeaders = new Headers(req.headers);
  if (slug) requestHeaders.set("x-tenant-slug", slug);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  // Only set the cookie for an actual tenant subdomain. On the apex domain
  // or localhost (slug === null), no tenant-specific cookie is forced.
  if (slug) {
    res.cookies.set("tenant_slug", slug, { httpOnly: true, sameSite: "lax" });
  } else {
    res.cookies.delete("tenant_slug");
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
