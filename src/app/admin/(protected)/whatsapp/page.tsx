import { pageAdmin } from "@/lib/page-auth";
import { WhatsAppPanel } from "@/components/whatsapp-panel";
export default async function Page() {
  await pageAdmin();
  return <WhatsAppPanel />;
}
