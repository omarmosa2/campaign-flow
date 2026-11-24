import { expect, it } from "vitest";
import { checkWhatsApp } from "@/server/whatsapp-database";
import { WHATSAPP_SETUP_REQUIRED } from "@/lib/whatsapp";
it("recognizes missing database prerequisites without leaking provider details", () => {
  for (const code of ["PGRST202", "PGRST205", "42P01", "42883"])
    expect(() =>
      checkWhatsApp({
        data: null,
        error: { code, message: "internal schema details" },
      }),
    ).toThrow(WHATSAPP_SETUP_REQUIRED);
});
it("preserves normal database error handling for permissions and validation failures", () => {
  expect(() =>
    checkWhatsApp({
      data: null,
      error: { code: "42501", message: "private database error" },
    }),
  ).toThrow("تعذر حفظ البيانات أو تحميلها");
  expect(checkWhatsApp({ data: { enabled: true }, error: null })).toEqual({
    enabled: true,
  });
});
