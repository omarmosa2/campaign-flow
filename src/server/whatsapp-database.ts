import "server-only";
import { check } from "@/lib/http";
import { WHATSAPP_SETUP_REQUIRED } from "@/lib/whatsapp";

export function checkWhatsApp<T>(result: {
  data: T;
  error: { code?: string; message: string } | null;
}) {
  // Missing tables/functions are a deployment prerequisite, not invalid client input.
  if (
    result.error &&
    ["PGRST202", "PGRST205", "42P01", "42883"].includes(result.error.code ?? "")
  )
    throw Error(WHATSAPP_SETUP_REQUIRED);
  return check(result);
}
