import { pageAdmin } from "@/lib/page-auth";
import { AdminShell } from "@/components/admin-shell";
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await pageAdmin();
  return (
    <AdminShell name={profile.display_name} role={profile.role}>
      {children}
    </AdminShell>
  );
}
