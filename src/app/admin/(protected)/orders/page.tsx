import { db } from "@/lib/supabase";
import { pageAdmin } from "@/lib/page-auth";
import { check } from "@/lib/http";
import { RequestsPanel } from "@/components/requests-panel";
export default async function Page() {
  await pageAdmin();
  const data = check(
    await db().rpc("list_ad_requests", { p_search: "", p_page: 1 }),
  );
  return <RequestsPanel initial={data} />;
}
