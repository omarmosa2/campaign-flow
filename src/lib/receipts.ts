// Keep multipart overhead below the hosting request limit as well as the 4 MB file limit.
export const RECEIPT_MAX_BYTES = 4 * 1024 * 1024;
export const RECEIPT_BODY_MAX_BYTES = RECEIPT_MAX_BYTES + 64 * 1024;
export const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp"];
export function receiptError(file: { size: number; type: string } | null) {
  if (!file || !file.size) return "ارفع إشعار دفع شام كاش";
  if (file.size > RECEIPT_MAX_BYTES)
    return "حجم الإشعار يجب ألا يتجاوز 4 ميغابايت";
  if (!RECEIPT_TYPES.includes(file.type))
    return "استخدم صورة JPG أو JPEG أو PNG أو WEBP";
  return "";
}
export function validReceipt(bytes: Uint8Array, mime: string) {
  if (mime === "image/png")
    return [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  if (mime === "image/jpeg")
    return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === "image/webp") {
    const text = new TextDecoder();
    return (
      bytes.length >= 16 &&
      text.decode(bytes.slice(0, 4)) === "RIFF" &&
      text.decode(bytes.slice(8, 12)) === "WEBP" &&
      ["VP8 ", "VP8L", "VP8X"].includes(text.decode(bytes.slice(12, 16)))
    );
  }
  return false;
}
