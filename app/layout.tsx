import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { AppProviders } from "@/components/providers/app-providers";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Energy Arc",
  description: "A minimalist approach to progress tracking.",
  applicationName: "Energy Arc",
  appleWebApp: {
    // Lets iOS run it fullscreen from the home screen, like Android does
    // from the manifest.
    capable: true,
    title: "Energy Arc",
    // The app is dark by default, so a light status bar would sit as a white
    // band above a near-black page.
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
  // Stops iOS turning numbers in meal names into phone links.
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f10" },
  ],
  // Installed apps should feel native: no pinch-zoom on chrome, and content
  // extends into the notch area.
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning is required by next-themes: it sets the theme
    // class on <html> before React hydrates, so server and client markup
    // differ by design on this one element.
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} antialiased`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
