"use client";
import type { Field } from "@/lib/domain";
export function DynamicFields({
  fields,
  answers,
  onChange,
  onFile,
}: {
  fields: Field[];
  answers: Record<string, unknown>;
  onChange: (id: string, value: unknown) => void;
  onFile?: (id: string, file: File | null) => void;
}) {
  return (
    <>
      {fields.map((f) => (
        <div key={f.id}>
          <label htmlFor={`field_${f.id}`}>
            {f.label}
            {f.required ? " *" : ""}
          </label>
          {f.description && <p className="muted small">{f.description}</p>}
          {["consent", "checkboxes", "radio"].includes(f.type) ? (
            <div className="stack" style={{ gap: 8, marginTop: 8 }}>
              {(f.type === "consent" ? ["أوافق"] : f.options).map((option) => (
                <label key={option}>
                  <input
                    id={f.type === "consent" ? `field_${f.id}` : undefined}
                    type={f.type === "radio" ? "radio" : "checkbox"}
                    name={f.id}
                    required={f.required && f.type !== "checkboxes"}
                    checked={
                      f.type === "consent"
                        ? answers[f.id] === true
                        : f.type === "radio"
                          ? answers[f.id] === option
                          : Array.isArray(answers[f.id]) &&
                            (answers[f.id] as string[]).includes(option)
                    }
                    onChange={(e) =>
                      onChange(
                        f.id,
                        f.type === "consent"
                          ? e.target.checked
                          : f.type === "radio"
                            ? option
                            : e.target.checked
                              ? [...((answers[f.id] as string[]) ?? []), option]
                              : ((answers[f.id] as string[]) ?? []).filter(
                                  (x) => x !== option,
                                ),
                      )
                    }
                  />
                  {option}
                </label>
              ))}
            </div>
          ) : f.type === "textarea" ? (
            <textarea
              id={`field_${f.id}`}
              required={f.required}
              placeholder={f.placeholder}
              value={String(answers[f.id] ?? "")}
              onChange={(e) => onChange(f.id, e.target.value)}
              minLength={f.min}
              maxLength={f.max}
            />
          ) : f.type === "select" ? (
            <select
              id={`field_${f.id}`}
              required={f.required}
              value={String(answers[f.id] ?? "")}
              onChange={(e) => onChange(f.id, e.target.value)}
            >
              <option value="">اختر...</option>
              {f.options.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          ) : f.type === "file" ? (
            <input
              id={`field_${f.id}`}
              type="file"
              accept="image/png,image/jpeg,application/pdf"
              required={f.required}
              onChange={(e) => onFile?.(f.id, e.target.files?.[0] ?? null)}
            />
          ) : (
            <input
              id={`field_${f.id}`}
              type={f.type}
              required={f.required}
              placeholder={f.placeholder}
              value={String(answers[f.id] ?? "")}
              onChange={(e) => onChange(f.id, e.target.value)}
              min={f.type === "number" ? f.min : undefined}
              max={f.type === "number" ? f.max : undefined}
              minLength={f.type !== "number" ? f.min : undefined}
              maxLength={f.type !== "number" ? f.max : undefined}
            />
          )}
        </div>
      ))}
    </>
  );
}
