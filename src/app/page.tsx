import Link from "next/link";
import { ArrowUpLeft, Target } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
export default function Page() {
  return (
    <PublicShell>
      <section className="request-hero">
        <h1>
          ابدأ حملتك الإعلانية
          <em>بسهولة</em>
        </h1>
        <p>
          قدّم طلبك الإعلاني خلال دقائق، وحدد موقع عرض الإعلان والفئة العمرية
          واهتمامات الجمهور والهدف من حملتك.
        </p>
        <Link className="btn hero-cta" href="/request">
          طلب خدمة <ArrowUpLeft size={20} />
        </Link>
        <span className="muted small">
          أربع خطوات واضحة، وبداية جديدة لحضورك.
        </span>
      </section>
    </PublicShell>
  );
}
