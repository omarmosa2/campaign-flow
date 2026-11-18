
import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const rl = createInterface({ input: stdin, output: stdout });

try {
  const email = (await rl.question("Admin email: ")).trim();
  const password = process.env.RESET_ADMIN_PASSWORD;

  if (!password || password.length < 12) {
    throw new Error("Password must contain at least 12 characters");
  }

  const { data: users, error: listError } =
    await supabase.auth.admin.listUsers();

  if (listError) throw listError;

  const user = users.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );

  if (!user) throw new Error("Admin user not found");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, enabled")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.enabled ||
      !["admin", "super_admin"].includes(profile.role)) {
    throw new Error("User is not an enabled administrator");
  }

  const { error } = await supabase.auth.admin.updateUserById(
    user.id,
    { password }
  );

  if (error) throw error;

  console.log("Admin password updated successfully");
} catch (error) {
  console.error("Error:", error.message);
  process.exitCode = 1;
} finally {
  rl.close();
}
