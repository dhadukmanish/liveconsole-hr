import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Mukta, Mukta_Vaani } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";

/**
 * Mukta covers Latin and Devanagari but has no Gujarati subset — that lives in
 * Mukta Vaani. Both are loaded and listed in one font stack so the browser
 * resolves Gujarati glyphs from Mukta Vaani per glyph, keeping one look.
 */
const mukta = Mukta({
  subsets: ["latin", "devanagari"],
  // Three weights, not five: each extra weight is another file per subset, and
  // fonts were the whole of this page's Largest Contentful Paint.
  weight: ["400", "600", "700"],
  variable: "--font-mukta",
  display: "swap",
});

const muktaVaani = Mukta_Vaani({
  // Gujarati only — Latin glyphs come from Mukta, which is already loaded.
  subsets: ["gujarati"],
  weight: ["400", "600"],
  variable: "--font-mukta-vaani",
  display: "swap",
  // Not preloaded: it is only needed by Gujarati readers, and preloading it
  // made every other user pay for glyphs they never render.
  preload: false,
});

export const metadata: Metadata = {
  title: "Live Console HR",
  description: "HR console for tasks, attendance, leave and documents.",
  manifest: "/manifest.webmanifest",
  // A private HR console has no business in a search index.
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Live Console HR" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7941D" },
    { media: "(prefers-color-scheme: dark)", color: "#151412" },
  ],
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom stays available: disabling it fails WCAG and annoys people.
  maximumScale: 5,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const themePref = (await cookies()).get("lc_theme")?.value ?? "system";

  return (
    <html
      lang={locale}
      className={`${mukta.variable} ${muktaVaani.variable} ${themePref === "dark" ? "dark" : ""}`}
      suppressHydrationWarning
    >
      <head>
        {themePref === "system" ? (
          // Applies the OS preference before first paint, so there is no flash
          // of the wrong theme. Kept tiny and inline on purpose.
          <script
            dangerouslySetInnerHTML={{
              __html:
                "try{if(window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.classList.add('dark')}}catch(e){}",
            }}
          />
        ) : null}
      </head>
      <body className="min-h-dvh bg-page text-ink antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
