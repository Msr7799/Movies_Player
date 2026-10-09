import type { Metadata, Viewport } from "next";
import { Noto_Kufi_Arabic } from "next/font/google";
import "./globals.css";

const kufi = Noto_Kufi_Arabic({
  variable: "--font-kufi",
  subsets: ["arabic"],
});

export const metadata: Metadata = {
  title: "سينما — مشغل الأفلام",
  description: "مشغل أفلام محلي متقدم بواجهة عربية",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0c1421",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className={kufi.variable}>
      <body>{children}</body>
    </html>
  );
}
