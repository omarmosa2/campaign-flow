import Image from "next/image";
import { Inbox, Orbit, ArrowUpLeft } from "lucide-react";
import Link from "next/link";
import { labels } from "@/lib/domain";
export function Brand({
  name = "مدار",
  logo,
}: {
  name?: string;
  logo?: string;
}) {
  return (
    <Link href="/" className="brand">
      <span className="brand-mark">
        {logo ? (
          <Image
            unoptimized
            width={640}
            height={400}
            src={`/api/assets?path=${encodeURIComponent(logo)}`}
            alt=""
            style={{ width: 34, height: 34, objectFit: "contain" }}
          />
        ) : (
          <Orbit size={27} />
        )}
      </span>
      <span>
        {name}
        <small>CAMPAIGN FLOW</small>
      </span>
    </Link>
  );
}
export function Badge({ value }: { value: string }) {
  return (
    <span
      className={`badge ${["payment_review", "pending_payment", "pending", "draft", "sending"].includes(value) ? "warn" : ["failed", "payment_rejected", "cancelled", "uncertain"].includes(value) ? "danger" : ""}`}
    >
      <span className="dot" />
      {labels[value] ?? value}
    </span>
  );
}
export function Empty({
  title = "لا توجد بيانات بعد",
  description = "ستظهر البيانات هنا عند بدء استخدام المنصة.",
  href,
  action,
}: {
  title?: string;
  description?: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Inbox size={25} />
      </span>
      <h3>{title}</h3>
      <p className="small">{description}</p>
      {href && (
        <Link className="btn btn-outline btn-sm" href={href}>
          {action}
          <ArrowUpLeft size={14} />
        </Link>
      )}
    </div>
  );
}
export function Setup() {
  return (
    <div className="card stack">
      <h2>لنجهّز مساحة العمل</h2>
      <p className="muted">
        لم يتم ربط قاعدة البيانات بعد. لا توجد بيانات تجريبية أو عمليات دفع
        مفعلة.
      </p>
      <div className="alert">
        أضف متغيرات البيئة، طبّق ترحيل قاعدة البيانات، ثم أنشئ حساب المدير وفق
        ملف DEPLOYMENT.md.
      </div>
      <Link href="/admin/login" className="btn">
        دخول لوحة الإدارة
      </Link>
    </div>
  );
}
