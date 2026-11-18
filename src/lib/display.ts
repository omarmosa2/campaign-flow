import { format } from "date-fns";
export function displayDate(
  iso: string,
  timezone = "Asia/Damascus",
  pattern = "dd/MM/yyyy",
) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (k: string) => parts.find((p) => p.type === k)!.value;
  return format(
    new Date(Number(get("year")), Number(get("month")) - 1, Number(get("day"))),
    pattern,
  );
}
