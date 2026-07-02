import type { Metadata } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react";

export const metadata: Metadata = {
  title: "CV Matcher — Hub of Global Opportunities",
  description: "Upload your CV to instantly match with international remote jobs, scholarships, and fellowships.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#FAF9F6] text-[#2C221E] min-h-screen antialiased selection:bg-[#D4C5B9]">
        {children}
        <Analytics />
      </body>
    </html>
  );
}