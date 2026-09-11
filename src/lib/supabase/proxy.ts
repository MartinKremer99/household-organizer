import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { clearHouseholdIdCookieOnResponse } from "@/lib/supabase/household-cookie";

function withCopiedCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });
  return to;
}

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    if (request.nextUrl.pathname === "/login") {
      return NextResponse.next({ request });
    }
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    return clearHouseholdIdCookieOnResponse(NextResponse.redirect(login));
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([key, value]) =>
          supabaseResponse.headers.set(key, value),
        );
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  let isAuthenticated = Boolean(data?.claims);
  if (isAuthenticated) {
    const { data: userData, error } = await supabase.auth.getUser();
    if (error || !userData.user) {
      await supabase.auth.signOut();
      isAuthenticated = false;
    }
  }
  const pathname = request.nextUrl.pathname;
  const isPublicAuthRoute = pathname === "/login";

  if (!isAuthenticated && !isPublicAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return clearHouseholdIdCookieOnResponse(
      withCopiedCookies(supabaseResponse, NextResponse.redirect(url)),
    );
  }

  if (isAuthenticated && isPublicAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return withCopiedCookies(supabaseResponse, NextResponse.redirect(url));
  }

  if (!isAuthenticated) {
    return clearHouseholdIdCookieOnResponse(supabaseResponse);
  }

  return supabaseResponse;
}
