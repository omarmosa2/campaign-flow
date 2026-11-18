"use client";
import { useState } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown, Eye } from "lucide-react";
import type { Field } from "@/lib/domain";
import { Button } from "./ui/button";
import { DynamicFields } from "./dynamic-fields";
const types: Record<Field["type"], string> = {
  text: "نص قصير",
  textarea: "نص طويل",
  number: "رقم",
  email: "بريد إلكتروني",
  tel: "رقم هاتف",
  url: "رابط",
  select: "قائمة منسدلة",
  radio: "اختيار واحد",
  checkboxes: "اختيار متعدد",
  date: "تاريخ",
  consent: "موافقة",
  file: "رفع ملف",
};
export function FormBuilder({
  fields,
  onChange,
}: {
  fields: Field[];
  onChange: (v: Field[]) => void;
}) {
  const [preview, setPreview] = useState(false);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  function update(i: number, patch: Partial<Field>) {
    onChange(fields.map((f, n) => (n === i ? { ...f, ...patch } : f)));
  }
  function move(i: number, dir: number) {
    const next = [...fields];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    onChange(next);
  }
  return (
    <section className="stack">
      <div className="row between wrap">
        <div>
          <h2>نموذج بيانات العميل</h2>
          <p className="small muted">
            الاسم والهاتف حقول أساسية. أضف ما تحتاجه لخدمتك.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setPreview(!preview)}
        >
          <Eye size={15} />
          {preview ? "العودة للتحرير" : "معاينة النموذج"}
        </Button>
      </div>
      {preview ? (
        <div className="card stack">
          <DynamicFields
            fields={fields}
            answers={answers}
            onChange={(id, v) => setAnswers({ ...answers, [id]: v })}
          />
          {!fields.length && (
            <p className="muted small">لم تُضف حقولاً إضافية.</p>
          )}
        </div>
      ) : (
        fields.map((f, i) => (
          <div className="field-card" key={f.id}>
            <div className="row between">
              <b className="small">الحقل {i + 1}</b>
              <div className="row">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={i === 0}
                  aria-label="نقل للأعلى"
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp size={15} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={i === fields.length - 1}
                  aria-label="نقل للأسفل"
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown size={15} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="حذف الحقل"
                  onClick={() => onChange(fields.filter((_, n) => n !== i))}
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            </div>
            <div className="form-grid">
              <label>
                عنوان الحقل
                <input
                  value={f.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                />
              </label>
              <label>
                نوع الحقل
                <select
                  value={f.type}
                  onChange={(e) =>
                    update(i, { type: e.target.value as Field["type"] })
                  }
                >
                  {Object.entries(types).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                وصف توضيحي
                <input
                  value={f.description}
                  onChange={(e) => update(i, { description: e.target.value })}
                />
              </label>
              <label>
                النص الافتراضي
                <input
                  value={f.placeholder}
                  onChange={(e) => update(i, { placeholder: e.target.value })}
                />
              </label>
              {["select", "radio", "checkboxes"].includes(f.type) && (
                <label className="full">
                  الخيارات (خيار في كل سطر)
                  <textarea
                    value={f.options.join("\n")}
                    onChange={(e) =>
                      update(i, { options: e.target.value.split("\n") })
                    }
                  />
                </label>
              )}
              {![
                "file",
                "consent",
                "checkboxes",
                "radio",
                "select",
                "date",
              ].includes(f.type) && (
                <>
                  <label>
                    {f.type === "number" ? "أقل قيمة" : "أقل عدد أحرف"}
                    <input
                      type="number"
                      value={f.min ?? ""}
                      onChange={(e) =>
                        update(i, {
                          min:
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    {f.type === "number" ? "أعلى قيمة" : "أقصى عدد أحرف"}
                    <input
                      type="number"
                      value={f.max ?? ""}
                      onChange={(e) =>
                        update(i, {
                          max:
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                </>
              )}
              <label>
                <input
                  type="checkbox"
                  checked={f.required}
                  onChange={(e) => update(i, { required: e.target.checked })}
                />
                حقل إلزامي
              </label>
            </div>
          </div>
        ))
      )}
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          onChange([
            ...fields,
            {
              id: `f_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
              label: "حقل جديد",
              type: "text",
              required: false,
              description: "",
              placeholder: "",
              options: [],
            },
          ])
        }
        disabled={fields.length >= 30}
      >
        <Plus size={16} />
        إضافة حقل
      </Button>
    </section>
  );
}
