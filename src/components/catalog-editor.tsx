"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save, Upload, ArrowRight } from "lucide-react";
import Link from "next/link";
import type { Item } from "@/types";
import { catalogSchema } from "@/lib/domain";
import { FormBuilder } from "./form-builder";
import { Button } from "./ui/button";
export function CatalogEditor({
  kind,
  item,
  services = [],
  defaultCurrency = "USD",
}: {
  kind: string;
  item?: Item;
  services?: { id: string; name: string }[];
  defaultCurrency?: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<Item>(
    item ?? {
      id: "",
      name: "",
      slug: "",
      description: "",
      details: "",
      price: 0,
      currency: defaultCurrency,
      status: "draft",
      image_path: null,
      form_schema: [],
      starts_at: null,
      ends_at: null,
      max_orders: null,
      sort_order: 0,
      duration: "",
      instructions: "",
      service_ids: [],
    },
  );
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  function patch(p: Partial<Item>) {
    setData((d) => ({ ...d, ...p }));
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = catalogSchema.safeParse(data);
    if (!parsed.success) {
      toast.error(parsed.error.issues.map((i) => i.message).join("، "));
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/catalog/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...parsed.data, id: data.id || undefined }),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      toast.success("تم حفظ التغييرات");
      router.push(`/admin/${kind}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="stack">
      <div className="page-head">
        <div>
          <Link href={`/admin/${kind}`} className="eyebrow">
            <ArrowRight size={14} />
            العودة إلى القائمة
          </Link>
          <h1>
            {item ? "تعديل" : "إضافة"} {kind === "campaigns" ? "حملة" : "خدمة"}
          </h1>
        </div>
        <Button disabled={busy || uploading}>
          <Save size={16} />
          {busy ? "جارٍ الحفظ..." : "حفظ التغييرات"}
        </Button>
      </div>
      <div className="grid-2" style={{ alignItems: "start" }}>
        <section className="card stack">
          <h2>التفاصيل الأساسية</h2>
          <div className="form-grid">
            <label className="full">
              الاسم
              <input
                required
                value={data.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </label>
            <label className="full">
              الرابط المخصص (إنجليزي)
              <input
                dir="ltr"
                required
                value={data.slug}
                placeholder="summer-offer"
                onChange={(e) => patch({ slug: e.target.value })}
              />
            </label>
            <label className="full">
              وصف قصير
              <textarea
                required
                value={data.description}
                onChange={(e) => patch({ description: e.target.value })}
              />
            </label>
            <label className="full">
              التفاصيل
              <textarea
                value={data.details}
                onChange={(e) => patch({ details: e.target.value })}
              />
            </label>
            <label>
              السعر
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={data.price}
                onChange={(e) => patch({ price: Number(e.target.value) })}
              />
            </label>
            <label>
              العملة
              <select
                value={data.currency}
                onChange={(e) => patch({ currency: e.target.value })}
              >
                {["USD", "SYP", "EUR", "TRY"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              الحالة
              <select
                value={data.status}
                onChange={(e) => patch({ status: e.target.value })}
              >
                <option value="draft">مسودة / متوقفة</option>
                <option value="active">نشطة</option>
                <option value="archived">مؤرشفة</option>
              </select>
            </label>
            <label>
              ترتيب العرض
              <input
                type="number"
                value={data.sort_order}
                onChange={(e) => patch({ sort_order: Number(e.target.value) })}
              />
            </label>
            <label className="full">
              صورة العرض (حتى 4 MB)
              <input
                type="file"
                accept="image/png,image/jpeg"
                disabled={uploading}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setUploading(true);
                  try {
                    const form = new FormData();
                    form.set("file", f);
                    const r = await fetch("/api/admin/uploads", {
                      method: "POST",
                      body: form,
                    });
                    const b = await r.json();
                    if (!r.ok) throw Error(b.error);
                    patch({ image_path: b.path });
                    toast.success("تم رفع الصورة");
                  } catch (e) {
                    toast.error((e as Error).message);
                  } finally {
                    setUploading(false);
                  }
                }}
              />
              <span className="muted row">
                <Upload size={14} />
                {uploading
                  ? "جارٍ الرفع"
                  : data.image_path
                    ? "الصورة محفوظة"
                    : "PNG أو JPEG"}
              </span>
            </label>
            {data.image_path && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => patch({ image_path: null })}
              >
                إزالة صورة العرض
              </Button>
            )}
            {kind === "campaigns" ? (
              <>
                <label>
                  البداية (بتوقيت جهازك)
                  <input
                    type="datetime-local"
                    value={
                      data.starts_at
                        ? new Date(
                            new Date(data.starts_at).getTime() -
                              new Date(data.starts_at).getTimezoneOffset() *
                                60000,
                          )
                            .toISOString()
                            .slice(0, 16)
                        : ""
                    }
                    onChange={(e) =>
                      patch({
                        starts_at: e.target.value
                          ? new Date(e.target.value).toISOString()
                          : null,
                      })
                    }
                  />
                </label>
                <label>
                  النهاية (بتوقيت جهازك)
                  <input
                    type="datetime-local"
                    value={
                      data.ends_at
                        ? new Date(
                            new Date(data.ends_at).getTime() -
                              new Date(data.ends_at).getTimezoneOffset() *
                                60000,
                          )
                            .toISOString()
                            .slice(0, 16)
                        : ""
                    }
                    onChange={(e) =>
                      patch({
                        ends_at: e.target.value
                          ? new Date(e.target.value).toISOString()
                          : null,
                      })
                    }
                  />
                </label>
                <label>
                  الحد الأقصى للطلبات
                  <input
                    type="number"
                    min="1"
                    value={data.max_orders ?? ""}
                    onChange={(e) =>
                      patch({
                        max_orders: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                  />
                </label>
                <div className="full stack">
                  <h3>الخدمات المرتبطة</h3>
                  <p className="small muted">
                    عند اختيار خدمة، يُستخدم سعرها وعملتها مع نموذج الحملة.
                  </p>
                  {services.map((s) => (
                    <label key={s.id}>
                      <input
                        type="checkbox"
                        checked={data.service_ids?.includes(s.id) ?? false}
                        onChange={(e) =>
                          patch({
                            service_ids: e.target.checked
                              ? [...(data.service_ids ?? []), s.id]
                              : (data.service_ids ?? []).filter(
                                  (id) => id !== s.id,
                                ),
                          })
                        }
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
              </>
            ) : (
              <>
                <label className="full">
                  المدة التقديرية
                  <input
                    value={data.duration}
                    onChange={(e) => patch({ duration: e.target.value })}
                  />
                </label>
                <label className="full">
                  تعليمات خاصة
                  <textarea
                    value={data.instructions}
                    onChange={(e) => patch({ instructions: e.target.value })}
                  />
                </label>
              </>
            )}
          </div>
        </section>
        <div className="card">
          <FormBuilder
            fields={data.form_schema}
            onChange={(form_schema) => patch({ form_schema })}
          />
        </div>
      </div>
    </form>
  );
}
