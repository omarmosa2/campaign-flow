import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/supabase";
import { validFile } from "@/lib/domain";
export async function upload(file: File, prefix: string, imagesOnly = false) {
  if (!file.size || file.size > 5 * 1024 * 1024)
    throw Error("حجم الملف يجب ألا يتجاوز 5 ميغابايت");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (
    (imagesOnly && !file.type.startsWith("image/")) ||
    !validFile(bytes, file.type)
  )
    throw Error(
      "نوع الملف غير صالح؛ استخدم PNG أو JPEG" + (imagesOnly ? "" : " أو PDF"),
    );
  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/jpeg"
        ? "jpg"
        : "pdf";
  const path = `${prefix}/${randomUUID()}.${ext}`;
  const { error } = await db()
    .storage.from("private-assets")
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (error) throw Error("تعذر رفع الملف، حاول لاحقاً");
  return { path, mime: file.type, size: file.size };
}

export async function removeUnreferenced(paths: string[]) {
  if (!paths.length) return;
  const client = db();
  const { data, error } = await client
    .from("attachments")
    .select("path")
    .in("path", paths);
  if (error) {
    console.error("storage_cleanup_reference_check_failed");
    return;
  }
  const used = new Set(data.map((a) => a.path));
  const unused = paths.filter((p) => !used.has(p));
  if (unused.length) {
    const result = await client.storage.from("private-assets").remove(unused);
    if (result.error) console.error("storage_cleanup_failed");
  }
}
