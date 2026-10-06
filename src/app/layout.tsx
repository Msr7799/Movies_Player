import type { Metadata } from "next";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className={kufi.variable}>
      <body>{children}</body>
    </html>
  );
}
