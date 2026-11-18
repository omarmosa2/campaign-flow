"use client";
import { useEffect, useState } from "react";
import { ClipboardList, CalendarDays } from "lucide-react";
export function RequestStats({
  initial,
}: {
  initial: { total: number; today: number };
}) {
  const [stats, setStats] = useState(initial),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function refresh() {
      try {
        const r = await fetch("/api/admin/stats", {
          signal: controller.signal,
        });
        const b = await r.json();
        if (!r.ok) throw Error(b.error);
        if (active) {
          setStats(b);
          setError("");
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    }
    const timer = setInterval(refresh, 10000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="request-stats">
        {[
          { label: "إجمالي الطلبات", value: stats.total, Icon: ClipboardList },
          { label: "طلبات اليوم", value: stats.today, Icon: CalendarDays },
        ].map(({ label, value, Icon }) => (
          <article className="card request-stat" key={label}>
            <span className="stat-icon">
              <Icon size={26} />
            </span>
            <h2>{label}</h2>
            <strong aria-live="polite">{value.toLocaleString("ar")}</strong>
          </article>
        ))}
      </div>
    </>
  );
}
