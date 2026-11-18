import "server-only";
import { redirect } from "next/navigation";
import { admin } from "./supabase";
export async function pageAdmin() {
  try {
    return await admin();
  } catch {
    redirect("/admin/login");
  }
}
