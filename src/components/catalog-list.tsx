"use client";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Copy,
  Link2,
  Plus,
  Search,
  Megaphone,
  Layers3,
  ArrowUpLeft,
} from "lucide-react";
import { toast } from "sonner";
import type { Item } from "@/types";
import { Button } from "./ui/button";
import { Badge, Empty } from "./common";
export function CatalogList({
  kind,
  items,
  stats,
}: {
  kind: string;
  items: Item[];
  stats: Record<string, { orders: number; revenue: Record<string, number> }>;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("recent");
  const [busy, setBusy] = useState("");
  const filtered = items
    .filter((i) => i.name.includes(q) && (!status || i.status === status))
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name, "ar")
        : sort === "status"
          ? a.status.localeCompare(b.status)
          : 0,
    );
  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">إدارة المحتوى</span>
          <h1>{kind === "campaigns" ? "الحملات الإعلانية" : "الخدمات"}</h1>
          <p>أنشئ عروضك، خصّص نماذجك وتابع نتائجها.</p>
        </div>
        <Link className="btn" href={`/admin/${kind}/new`}>
          <Plus size={17} />
          {kind === "campaigns" ? "حملة جديدة" : "خدمة جديدة"}
        </Link>
      </div>
      <div className="row wrap" style={{ marginBottom: 24 }}>
        <div className="row search">
          <Search size={18} />
          <input
            aria-label="البحث"
            placeholder="ابحث بالاسم..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          aria-label="تصفية الحالة"
          style={{ width: 160 }}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">جميع الحالات</option>
          <option value="active">نشطة</option>
          <option value="draft">مسودة / متوقفة</option>
          <option value="archived">مؤرشفة</option>
        </select>
        <select
          aria-label="ترتيب"
          style={{ width: 155 }}
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="recent">الأحدث أولاً</option>
          <option value="name">حسب الاسم</option>
          <option value="status">حسب الحالة</option>
        </select>
        <span className="muted small">{filtered.length} نتيجة</span>
      </div>
      {!filtered.length ? (
        <div className="card">
          <Empty
            title="ابدأ بعرضك الأول"
            description="أضف التفاصيل والسعر ونموذج العميل، ثم انشر الرابط."
            href={`/admin/${kind}/new`}
            action="إنشاء الآن"
          />
        </div>
      ) : (
        <div className="grid-3">
          {filtered.map((i) => (
            <article className="card stack" key={i.id} style={{ gap: 15 }}>
              {i.image_path ? (
                <Image
                  unoptimized
                  width={640}
                  height={400}
                  className="catalog-image"
                  src={`/api/assets?path=${encodeURIComponent(i.image_path)}`}
                  alt=""
                />
              ) : (
                <div className="catalog-art">
                  {kind === "campaigns" ? (
                    <Megaphone size={40} />
                  ) : (
                    <Layers3 size={40} />
                  )}
                </div>
              )}
              <div className="row between">
                <h2>{i.name}</h2>
                <Badge value={i.status} />
              </div>
              <p className="muted small">{i.description}</p>
              <div className="row between">
                <span className="price">
                  {i.price}{" "}
                  <small className="muted" style={{ fontSize: 11 }}>
                    {i.currency}
                  </small>
                </span>
                <Link
                  className="small muted"
                  href={`/admin/orders?${kind === "campaigns" ? "campaign" : "service"}=${i.id}`}
                >
                  {stats[i.id]?.orders ?? 0} طلب{" "}
                  <ArrowUpLeft size={12} style={{ display: "inline" }} />
                </Link>
              </div>
              <p className="small muted">
                الإيراد المؤكد:{" "}
                {Object.entries(stats[i.id]?.revenue ?? {})
                  .map(([c, n]) => `${n} ${c}`)
                  .join(" • ") || "لا يوجد"}
              </p>
              <div
                className="row wrap"
                style={{ borderTop: "1px solid var(--border)", paddingTop: 15 }}
              >
                <Link
                  href={`/admin/${kind}/${i.id}`}
                  className="btn btn-outline btn-sm"
                >
                  إدارة {kind === "campaigns" ? "الحملة" : "الخدمة"}
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="نسخ الرابط"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        `${location.origin}/${kind}/${i.slug}`,
                      );
                      toast.success("تم نسخ الرابط");
                    } catch {
                      toast.error("تعذر النسخ، انسخ رابط المعاينة يدوياً");
                    }
                  }}
                >
                  <Link2 size={16} />
                </Button>
                <Link
                  aria-label="عرض الصفحة"
                  href={`/${kind}/${i.slug}`}
                  className="btn btn-ghost btn-icon"
                >
                  <ArrowUpLeft size={16} />
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busy === i.id}
                  aria-label="نسخ العرض كمسودة"
                  onClick={async () => {
                    setBusy(i.id);
                    try {
                      const r = await fetch(`/api/admin/catalog/${kind}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          ...i,
                          id: undefined,
                          name: `${i.name} (نسخة)`,
                          slug: `${i.slug.slice(0, 65)}-${crypto.randomUUID().slice(0, 6)}`,
                          status: "draft",
                        }),
                      });
                      const b = await r.json();
                      if (!r.ok) throw Error(b.error);
                      toast.success("تم إنشاء نسخة مسودة");
                      router.refresh();
                    } catch (e) {
                      toast.error((e as Error).message);
                    } finally {
                      setBusy("");
                    }
                  }}
                >
                  <Copy size={15} />
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
