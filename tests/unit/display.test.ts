import { it, expect } from "vitest";
import { displayDate } from "@/lib/display";
it("يعرض اليوم المحلي والتنسيق المختار دون تغيير التخزين UTC", () => {
  expect(
    displayDate("2026-11-18T22:30:00Z", "Asia/Damascus", "dd/MM/yyyy"),
  ).toBe("19/11/2026");
  expect(displayDate("2026-11-18T22:30:00Z", "UTC", "yyyy-MM-dd")).toBe(
    "2026-11-18",
  );
});
