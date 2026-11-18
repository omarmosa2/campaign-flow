import { PublicShell } from "@/components/public-shell";
import { RequestForm } from "@/components/request-form";
export default function Page() {
  return (
    <PublicShell>
        <h1>طلب حملة إعلانية</h1>
      <section className="request-page">
        <div className="card">
          <RequestForm />
        </div>
      </section>
    </PublicShell>
  );
}
