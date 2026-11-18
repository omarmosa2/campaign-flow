import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
export async function proxy(req: NextRequest) {
  let response = NextResponse.next({ request: req });
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
    return response;
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (values) => {
          values.forEach((v) => req.cookies.set(v.name, v.value));
          response = NextResponse.next({ request: req });
          values.forEach((v) =>
            response.cookies.set(v.name, v.value, v.options),
          );
        },
      },
    },
  );
  await client.auth.getUser();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = { matcher: ["/admin/:path*", "/api/admin/:path*"] };
