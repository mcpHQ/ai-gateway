import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export const metadata: Metadata = {
  title: "AI Gateway",
  description: "Open source AI gateway. Route OpenAI-compatible requests across providers with fallbacks, cache, budgets, and logs.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} scroll-smooth`}>
      <body className="min-h-screen bg-background bg-[radial-gradient(1100px_420px_at_50%_-120px,rgb(79_70_229_/_0.16),transparent)] font-sans text-foreground antialiased">{children}</body>
    </html>
  );
}
