import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { getSiteUrl } from "@/lib/site";
import {
  organizationJsonLd,
  websiteJsonLd,
} from "@/lib/structured-data";
import SiteFooter from "@/components/site-footer";
import SiteNavbar from "@/components/site-navbar";
import PageTransition from "@/components/PageTransition";
import { AuthProvider } from "@/lib/auth/auth-context";
import { ToastProvider } from "@/components/auth/ToastProvider";
import { WatchlistProvider } from "@/lib/watchlist/watchlist-context";
import WatchlistToasts from "@/components/watchlist/WatchlistToasts";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "OffAnime",
    template: "%s | OffAnime",
  },
  description:
    "OffAnime — a premium, cinematic anime streaming experience.",
  authors: [{ name: "OFFANIME" }],
  creator: "OFFANIME",
  publisher: "OFFANIME",
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-video-preview": -1, "max-image-preview": "large", "max-snippet": -1 },
  },
  openGraph: {
    title: "OffAnime",
    description:
      "OffAnime — a premium, cinematic anime streaming experience.",
    url: getSiteUrl(),
    siteName: "OFFANIME",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "OffAnime",
    description:
      "OffAnime — a premium, cinematic anime streaming experience.",
  },
  alternates: { canonical: getSiteUrl() },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        <ToastProvider>
          {/* Global auth store — ONE provider above the navbar and every
              route, so the whole site sees the same session state (restore
              happens once on mount; no per-page logic). */}
          <AuthProvider>
            {/* Global watchlist store — one shared account-backed list for
                every bookmark button and the /watchlist page (no per-card
                fetches). Reads the auth store, so it mounts inside. */}
            <WatchlistProvider>
              {/* One-shot toast for sign-in-completed bookmark intents. */}
              <WatchlistToasts />
              {/* Global navbar — fixed overlay, mounted once here so every
                  route (including the custom 404) gets it. It reads the auth
                  store: Login chip for guests, avatar menu for members. */}
              <SiteNavbar />
              <PageTransition>{children}</PageTransition>
            </WatchlistProvider>
          </AuthProvider>
          {/* Global footer — mounted once here so every route (including
              the custom 404) gets it without per-page duplication. */}
          <SiteFooter />

          {/* Organization + WebSite structured data, rendered once per page. */}
          <div
            dangerouslySetInnerHTML={{
              __html: organizationJsonLd() + websiteJsonLd(),
            }}
          />
        </ToastProvider>
      </body>
    </html>
  );
}
