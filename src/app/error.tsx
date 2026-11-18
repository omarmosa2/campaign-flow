"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="public-main">
      <div className="card empty">
        <h1>تعذر تحميل الصفحة</h1>
        <p>تحقق من الاتصال وإعداد قاعدة البيانات، ثم حاول مجدداً.</p>
        <Button onClick={reset}>إعادة المحاولة</Button>
      </div>
    </main>
  );
}
