import Link from "next/link";
export default function Page() {
  return (
    <main id="main" className="public-main empty">
      <span className="eyebrow">404</span>
      <h1>الصفحة غير موجودة</h1>
      <p>قد يكون الرابط غير صحيح أو لم يعد العرض متاحاً.</p>
      <Link href="/" className="btn">
        العودة للرئيسية
      </Link>
    </main>
  );
}
