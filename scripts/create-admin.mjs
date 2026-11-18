import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline/promises";
if (
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !process.env.SUPABASE_SERVICE_ROLE_KEY
)
  throw Error("أكمل إعداد .env.local");
const client = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const { count, error: countError } = await client
  .from("profiles")
  .select("id", { count: "exact", head: true })
  .eq("role", "super_admin")
  .eq("enabled", true);
if (countError) throw Error("طبّق migration أولاً");
if (count)
  throw Error("يوجد مدير نظام بالفعل. استخدم صفحة الفريق لإضافة مدير آخر.");
const terminal = createInterface({
  input: process.stdin,
  output: process.stdout,
});
const email = await terminal.question("Admin email: ");
const name = await terminal.question("Display name: ");
terminal.close();
// Password is read from a one-time environment variable, never printed or stored in the repository.
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
if (!password || password.length < 12)
  throw Error(
    "اضبط BOOTSTRAP_ADMIN_PASSWORD مؤقتاً بكلمة مرور قوية لا تقل عن 12 حرفاً",
  );
const { data, error } = await client.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (error)
  throw Error("تعذر إنشاء مستخدم Auth. تحقق من البريد وسياسة كلمة المرور.");
const saved = await client
  .from("profiles")
  .insert({ id: data.user.id, display_name: name, role: "super_admin" });
if (saved.error) {
  await client.auth.admin.deleteUser(data.user.id);
  throw Error("تعذر إنشاء profile؛ تم التراجع عن إنشاء مستخدم Auth");
}
console.log("تم إنشاء مدير النظام. يمكنك تسجيل الدخول الآن.");
