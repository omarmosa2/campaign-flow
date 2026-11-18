"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { ArrowLeft, LockKeyhole } from "lucide-react";
const schema = z.object({
  email: z.email("أدخل بريداً صحيحاً"),
  password: z.string().min(8, "كلمة المرور 8 أحرف على الأقل"),
});
export function LoginForm({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  return (
    <form
      className="stack"
      onSubmit={handleSubmit(async (data) => {
        try {
          const r = await fetch("/api/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
          const b = await r.json();
          if (!r.ok) throw Error(b.error);
          router.push("/admin/dashboard");
        } catch (e) {
          toast.error((e as Error).message);
        }
      })}
    >
      <label>
        البريد الإلكتروني
        <input
          dir="ltr"
          type="email"
          autoComplete="username"
          placeholder="you@company.com"
          {...register("email")}
        />
        {errors.email && <span className="error">{errors.email.message}</span>}
      </label>
      <label>
        كلمة المرور
        <input
          dir="ltr"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••••"
          {...register("password")}
        />
        {errors.password && (
          <span className="error">{errors.password.message}</span>
        )}
      </label>
      <Button disabled={isSubmitting || !enabled} type="submit">
        {isSubmitting ? "جارٍ تسجيل الدخول..." : "تسجيل الدخول"}
        <ArrowLeft size={17} />
      </Button>
      <p className="muted small row" style={{ justifyContent: "center" }}>
        <LockKeyhole size={14} />
        وصول آمن للمديرين المصرح لهم فقط
      </p>
    </form>
  );
}
