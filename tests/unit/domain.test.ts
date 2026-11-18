import { describe, it, expect } from "vitest";
import {
  slugSchema,
  fieldsSchema,
  validateAnswers,
  validFile,
  csv,
  retryDelay,
  orderSchema,
} from "@/lib/domain";
const field = (type = "text", extra = {}) =>
  fieldsSchema.parse([
    { id: "goal", label: "الهدف", type, required: true, ...extra },
  ]);
describe("قواعد الإدخال", () => {
  it("يمنع المسارات المحجوزة وغير الصالحة", () => {
    expect(slugSchema.safeParse("admin").success).toBe(false);
    expect(slugSchema.safeParse("a/b").success).toBe(false);
    expect(slugSchema.parse("summer-offer")).toBe("summer-offer");
  });
  it("يتحقق من الحقل الإلزامي", () => {
    expect(() => validateAnswers(field(), {})).toThrow("مطلوب");
    expect(() => validateAnswers(field(), { goal: "عمل" })).not.toThrow();
  });
  it("يرفض تكرار المعرفات", () =>
    expect(fieldsSchema.safeParse([...field(), ...field()]).success).toBe(
      false,
    ));
  it.each([
    ["email", "bad"],
    ["url", "javascript:alert(1)"],
    ["tel", "abc"],
    ["number", "NaN"],
    ["date", "tomorrow"],
    ["consent", false],
    ["file", "/public/image.png"],
  ])("يرفض %s غير الصالح", (type, v) =>
    expect(() => validateAnswers(field(type), { goal: v })).toThrow(),
  );
  it("يتحقق من الحدود", () => {
    expect(() =>
      validateAnswers(field("number", { min: 2, max: 4 }), { goal: 5 }),
    ).toThrow();
    expect(() =>
      validateAnswers(field("text", { min: 3 }), { goal: "ab" }),
    ).toThrow();
  });
  it("يرفض اختيارات خارج القائمة", () => {
    expect(() =>
      validateAnswers(field("checkboxes", { options: ["A"] }), { goal: ["B"] }),
    ).toThrow();
    expect(() =>
      validateAnswers(field("select", { options: ["A"] }), { goal: "A" }),
    ).not.toThrow();
  });
  it("يرفض الملفات المتنكرة", () => {
    expect(validFile(new TextEncoder().encode("<script>"), "image/png")).toBe(
      false,
    );
    expect(
      validFile(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), "image/png"),
    ).toBe(true);
    expect(validFile(new Uint8Array([255, 216, 255]), "image/jpeg")).toBe(true);
    expect(
      validFile(new TextEncoder().encode("%PDF-1.7"), "application/pdf"),
    ).toBe(true);
    expect(validFile(new Uint8Array(), "text/html")).toBe(false);
  });
  it("يحمي CSV من صيغ Excel ويحفظ BOM", () => {
    const output = csv([{ customer_name: '=HYPERLINK("x")', phone: "+963" }]);
    expect(output.startsWith("\uFEFF")).toBe(true);
    expect(output).toContain("'=HYPERLINK");
    expect(output).toContain("'+963");
  });
  it("يستخدم تأخيراً متزايداً محدوداً", () => {
    expect(retryDelay(2)).toBeGreaterThan(retryDelay(1));
    expect(retryDelay(999)).toBeLessThanOrEqual(86400);
  });
  it("يرفض الطلب دون موافقة ومع حقل فخ", () =>
    expect(
      orderSchema.safeParse({ website: "spam", consent: false }).success,
    ).toBe(false));
});
