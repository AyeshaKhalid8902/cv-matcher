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
      <body className="bg-[#F0F1FF] text-[#1E1B4B] min-h-screen antialiased selection:bg-[#C7D2FE]">
        {children}
        <Analytics />
      </body>
    </html>
  );
}