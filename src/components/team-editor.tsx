"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "./ui/button";
type Profile = {
  id: string;
  display_name: string;
  role: string;
  enabled: boolean;
};
export function TeamEditor({ profiles }: { profiles: Profile[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("admin");
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid-2">
      <section className="card stack">
        <h2>المديرون</h2>
        {profiles.map((p) => (
          <div key={p.id} className="row between">
            <span>
              {p.display_name}
              <small className="muted" style={{ display: "block" }}>
                {p.role === "super_admin" ? "مدير النظام" : "مدير العمليات"} ·{" "}
                {p.enabled ? "مفعّل" : "معطّل"}
              </small>
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSelected(p);
                setName(p.display_name);
                setRole(p.role);
                setEnabled(p.enabled);
              }}
            >
              تعديل الصلاحية
            </Button>
          </div>
        ))}
      </section>
      <form
        className="card stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const r = await fetch("/api/admin/team", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: selected?.id,
                display_name: name,
                email: selected ? undefined : email,
                password: selected ? undefined : password,
                role,
                enabled,
              }),
            });
            const b = await r.json();
            if (!r.ok) throw Error(b.error);
            toast.success("تم حفظ حساب المدير");
            setPassword("");
            router.refresh();
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="row between">
          <h2>{selected ? "تعديل الصلاحية" : "إضافة مدير"}</h2>
          {selected && (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => {
                setSelected(null);
                setName("");
                setRole("admin");
                setEnabled(true);
              }}
            >
              حساب جديد
            </Button>
          )}
        </div>
        <label>
          الاسم
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {!selected && (
          <>
            <label>
              البريد
              <input
                required
                type="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              كلمة مرور أولية (12 حرفاً على الأقل)
              <input
                required
                type="password"
                autoComplete="new-password"
                minLength={12}
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <p className="small muted">
              سلّم بيانات الدخول للمدير عبر وسيلة آمنة. لا تُرسل رسالة تلقائية.
            </p>
          </>
        )}
        <label>
          الدور
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="admin">
              مدير العمليات · الحملات والخدمات والطلبات
            </option>
            <option value="super_admin">
              مدير النظام · جميع الإعدادات والصلاحيات
            </option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          الحساب مفعّل
        </label>
        <Button disabled={busy}>تأكيد حفظ الحساب والصلاحية</Button>
      </form>
    </div>
  );
}
