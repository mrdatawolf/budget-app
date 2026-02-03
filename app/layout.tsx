import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { ToastProvider } from "@/contexts/ToastContext";
import { UncategorizedCountProvider } from "@/contexts/UncategorizedCountContext";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Budget App",
  description: "Zero-based budget tracking application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="overflow-hidden">
      <body
        className={`${outfit.variable} antialiased hide-scrollbar overflow-hidden`}
      >
        <ToastProvider>
          <UncategorizedCountProvider>
            {children}
          </UncategorizedCountProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
