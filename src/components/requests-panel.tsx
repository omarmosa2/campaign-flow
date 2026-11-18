"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RequestForm } from "./request-form";
import type { RequestList } from "@/lib/requests";
export function RequestsPanel({ initial }: { initial: RequestList }) {
  const [data, setData] = useState(initial),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const [version, setVersion] = useState(0);
  const [formVersion, setFormVersion] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function load() {
      try {
        const r = await fetch(
          `/api/admin/orders?q=${encodeURIComponent(query)}&page=${page}`,
          { signal: controller.signal },
        );
        const b = await r.json();
        if (!r.ok) throw Error(b.error);
        if (active) {
          setData(b);
          setError("");
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    }
    const debounce = setTimeout(load, 250);
    const timer = setInterval(load, 10000);
    const focus = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", focus);
    return () => {
      active = false;
      controller.abort();
      clearTimeout(debounce);
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [query, page, version]);
  const close = useCallback(() => dialog.current?.close(), []);
  const date = (v: string) =>
    new Intl.DateTimeFormat("ar", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: data.timezone,
    }).format(new Date(v));
  return (
    <>
      <div className="row between wrap">
        <div>
          <span className="eyebrow">مساحة الإدارة</span>
          <h1>الطلبات</h1>
          <p className="muted">
            جميع الطلبات في مكان واحد، من الأحدث إلى الأقدم.
          </p>
        </div>
        <button
          className="btn"
          onClick={() => {
            setFormVersion((v) => v + 1);
            dialog.current?.showModal();
          }}
        >
          + إضافة طلب جديد
        </button>
      </div>
      <div className="card stack">
        <label htmlFor="search">
          البحث في الطلبات
          <input
            id="search"
            type="search"
            value={query}
            placeholder="رقم الطلب أو بيانات الحملة"
            maxLength={200}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className="muted small" role="status">
          {data.total} طلب · الأوقات حسب {data.timezone}
        </p>
        <div className="requests-desktop">
          <table>
            <thead>
              <tr>
                {[
                  "رقم الطلب",
                  "موقع عرض الإعلان",
                  "الفئة العمرية",
                  "اهتمامات الجمهور",
                  "الهدف من الحملة الإعلانية",
                  "تاريخ الإنشاء",
                  "التفاصيل",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <td dir="ltr">{r.order_number}</td>
                  <td>{r.ad_placement ?? "طلب تاريخي"}</td>
                  <td>{r.age_group ?? "—"}</td>
                  <td className="interest-cell">
                    {r.audience_interests ?? "—"}
                  </td>
                  <td>{r.campaign_objective ?? "—"}</td>
                  <td>{date(r.created_at)}</td>
                  <td>
                    <Link
                      href={`/admin/orders/${r.id}`}
                      className="btn btn-outline btn-sm"
                    >
                      عرض التفاصيل
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="requests-mobile">
          {data.rows.map((r) => (
            <article key={r.id} className="request-tile stack">
              <strong dir="ltr">{r.order_number}</strong>
              <dl>
                <dt>موقع عرض الإعلان</dt>
                <dd>{r.ad_placement ?? "طلب تاريخي"}</dd>
                <dt>الفئة العمرية</dt>
                <dd>{r.age_group ?? "—"}</dd>
                <dt>اهتمامات الجمهور</dt>
                <dd>{r.audience_interests ?? "—"}</dd>
                <dt>الهدف من الحملة الإعلانية</dt>
                <dd>{r.campaign_objective ?? "—"}</dd>
                <dt>تاريخ الإنشاء</dt>
                <dd>{date(r.created_at)}</dd>
              </dl>
              <Link href={`/admin/orders/${r.id}`} className="btn btn-outline">
                عرض التفاصيل
              </Link>
            </article>
          ))}
        </div>
        {!data.rows.length && <p className="empty">لا توجد طلبات مطابقة.</p>}
        <nav aria-label="تصفح الطلبات" className="row between">
          <button
            className="btn btn-outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            السابق
          </button>
          <span>
            صفحة {page} من {Math.max(1, Math.ceil(data.total / 20))}
          </span>
          <button
            className="btn btn-outline"
            disabled={page * 20 >= data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            التالي
          </button>
        </nav>
      </div>
      <dialog
        ref={dialog}
        className="request-dialog"
        aria-labelledby="new-request-title"
      >
        <div className="row between">
          <h2 id="new-request-title">إضافة طلب جديد</h2>
          <button
            className="btn btn-ghost"
            onClick={close}
            aria-label="إغلاق النموذج"
          >
            إغلاق ×
          </button>
        </div>
        <RequestForm
          key={formVersion}
          admin
          onSuccess={() => {
            close();
            setVersion((v) => v + 1);
          }}
        />
      </dialog>
    </>
  );
}
