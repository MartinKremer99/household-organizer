import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PwaRegister } from "@/features/pwa/ui/pwa-register";
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
  title: "Household Organizer",
  description: "Private household inventory and shopping",
  appleWebApp: {
    capable: true,
    title: "Household",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F4F1EA",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      style={{ colorScheme: "light" }}
    >
      <body className="min-h-full flex flex-col">
        <a
          href="#main-content"
          className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2 focus-visible:z-30 focus-visible:inline-flex focus-visible:min-h-11 focus-visible:items-center focus-visible:rounded-control focus-visible:bg-surface focus-visible:px-3 focus-visible:text-body focus-visible:font-medium focus-visible:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Skip to content
        </a>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
