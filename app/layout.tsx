import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Keyword Intelligence — Autocomplete & AEO Research",
  description:
    "Scrape real Google and YouTube autocomplete suggestions across 60+ modifiers, classify search intent, and export curated keyword lists.",
};

export const viewport: Viewport = {
  themeColor: "#f6f7f9",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
