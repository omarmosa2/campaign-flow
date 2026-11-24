import "@fontsource/cairo/400.css";
import "@fontsource/cairo/600.css";
import "@fontsource/cairo/700.css";
import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "مدار | طلبات الإعلانات", template: "%s | مدار" },
  description: "قدّم طلب حملتك الإعلانية بسهولة وتابع الطلبات من مساحة واحدة.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      {/* Extensions such as ColorZilla add body attributes before hydration. */}
      <body suppressHydrationWarning>
        <a className="skip" href="#main">
          انتقل إلى المحتوى
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
