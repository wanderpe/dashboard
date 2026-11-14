import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { DashboardShell } from "@/components/dashboard-shell";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Harvy's Home Lab Command Center",
  description: "Private control interface for Harvy's home lab services.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[#020914]">
        <DashboardShell>{children}</DashboardShell>
      </body>
    </html>
  );
}
