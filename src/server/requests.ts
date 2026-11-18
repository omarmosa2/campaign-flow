import "server-only";
import { admin, db } from "@/lib/supabase";
import { check, hash, limit, origin } from "@/lib/http";
import { submissionSchema } from "@/lib/requests";
export async function submitRequest(req: Request, asAdmin = false) {
  origin(req);
  const actor = asAdmin ? await admin() : null;
  await limit(req, asAdmin ? "admin-request" : "public-request", 10);
  if (Number(req.headers.get("content-length")) > 24000)
    throw Error("حجم الطلب كبير جداً");
  const raw = await req.text();
  if (raw.length > 12000) throw Error("حجم الطلب كبير جداً");
  const body = submissionSchema.parse(JSON.parse(raw));
  const ip = (
    req.headers.get("x-vercel-forwarded-for") ??
    req.headers.get("x-forwarded-for") ??
    "local"
  )
    .split(",")[0]
    .trim();
  return check(
    await db().rpc("submit_ad_request", {
      p_key: body.idempotency_key,
      p_placement: body.ad_placement,
      p_age: body.age_group,
      p_interests: body.audience_interests,
      p_objective: body.campaign_objective,
      p_source: asAdmin ? "admin" : "public",
      p_client: hash(actor ? `admin:${actor.id}` : `public:${ip}`),
      p_actor: actor?.id ?? null,
    }),
  );
}
