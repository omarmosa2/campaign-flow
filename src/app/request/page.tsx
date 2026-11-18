import { PublicShell } from "@/components/public-shell";
import { RequestForm } from "@/components/request-form";
export default function Page() {
  return (
    <PublicShell>
      <section className="request-page">
        <span className="eyebrow">لنبدأ من جمهورك</span>
        <h1>طلب حملة إعلانية</h1>
        <p className="muted">أخبرنا عن حملتك، وسنتولى الخطوة التالية.</p>
        <div className="card">
          <RequestForm />
        </div>
      </section>
    </PublicShell>
  );
}
