import { Brand } from "@/components/common";
import { LoginForm } from "@/components/login-form";
import { configured } from "@/lib/supabase";
import { ThemeToggle } from "@/components/providers";
import { CheckCircle2 } from "lucide-react";
export default function Page() {
  return (
    <main id="main" className="login">
      <section className="login-visual">
        <Brand />
        <h1>
          كل تفاصيل عملك،
          <br />
          في مدار واحد.
        </h1>
        <p style={{ color: "#b4cfc1", maxWidth: 360 }}>
          استقبل طلبات الحملات الإعلانية وتابع تفاصيلها من مساحة عمل بسيطة.
        </p>
        <div className="stack" style={{ marginTop: 40, gap: 16 }}>
          {[
            "نظرة واضحة على طلباتك",
            "طلبات محفوظة بأمان",
            "تفاصيل الجمهور والهدف في مكان واحد",
          ].map((t) => (
            <div key={t} className="row small">
              <CheckCircle2 size={18} />
              {t}
            </div>
          ))}
        </div>
        <p style={{ marginTop: 70, color: "#86a497", fontSize: 11 }}>
          مدار · مساحة عمل أكثر تنظيماً
        </p>
      </section>
      <section className="login-form">
        <div className="login-box stack">
          <div className="row between">
            <span className="eyebrow">مرحباً بعودتك</span>
            <ThemeToggle />
          </div>
          <h1>سجّل دخولك</h1>
          <p className="muted" style={{ marginBottom: 15 }}>
            أكمل إدارة حملاتك وطلباتك من مكان واحد.
          </p>
          {!configured() && (
            <div className="alert">
              النظام غير متصل بعد. أكمل إعداد Supabase ومتغيرات البيئة حسب
              DEPLOYMENT.md لتفعيل تسجيل الدخول.
            </div>
          )}
          <LoginForm enabled={configured()} />
        </div>
      </section>
    </main>
  );
}
