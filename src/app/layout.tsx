import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "QuizDRE — trening wiedzy o drzwiach",
    template: "%s · QuizDRE",
  },
  description:
    "Aplikacja szkoleniowa DRE: codzienny quiz o modelach drzwi, rozwiązaniach technicznych i teorii. Streaki, rangi, rankingi.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "QuizDRE",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#f07818",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pl" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-white text-gray-800">
        {children}
      </body>
    </html>
  );
}
