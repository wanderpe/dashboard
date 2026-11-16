import type { Metadata } from "next";
import { Barlow_Condensed, Geist, Geist_Mono } from "next/font/google";

import { DashboardShell } from "@/components/dashboard-shell";
import { AuthSessionProvider } from "@/components/auth-session-provider";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Eric AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${barlowCondensed.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[#f1f5f6]">
        <AuthSessionProvider>
          <DashboardShell>{children}</DashboardShell>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
