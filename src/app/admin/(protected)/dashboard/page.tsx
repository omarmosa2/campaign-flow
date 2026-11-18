import { db } from "@/lib/supabase";
import { pageAdmin } from "@/lib/page-auth";
import { check } from "@/lib/http";
import { RequestStats } from "@/components/request-stats";
export default async function Page() {
  await pageAdmin();
  const stats = check(await db().rpc("ad_request_stats"));
  return (
    <>
      <h1>نظرة عامة</h1>
      <RequestStats initial={stats} />
    </>
  );
}
