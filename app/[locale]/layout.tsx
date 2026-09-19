import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { getMyPreferences } from "@/features/account/queries";
import { routing } from "@/i18n/routing";
import { DockProvider, ModalProvider } from "@/lib/context";
import { IconBundle } from "@/lib/icons/IconBundle";
import { UIProvider } from "@/lib/ui-store";

// Design tokens — imported first so they're available everywhere
import "@/styles/colors.scss";
import "@/styles/dimensions.css";
import "@/styles/typography.css";

// Base styles, resets & component utility classes
import "@/styles/globals.scss";

const hankenGrotesk = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-ui",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Barynt — Issue Tracker",
  description: "Open source issue tracker",
};

// `viewportFit: "cover"` lets the page run under the notch / home indicator —
// `styles/dimensions.css` (`--safe-*`) keeps the content out of it again.
// `resizes-content`: the on-screen keyboard shrinks the layout viewport (and
// with it `100dvh`) instead of covering the lower part of the page.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Provides the locale for Server Components.
  setRequestLocale(locale);

  // The theme belongs to the person, and `<html>` only exists here — so it's
  // resolved at this point rather than further down. It costs nothing where
  // nobody is signed in: `getMyPreferences` reads the session first and, without
  // one, returns the defaults without hitting the database. The login page
  // therefore stays dark, as it always did.
  //
  // Set server-side instead of via a browser script: the attribute is already
  // present in the document's first byte this way. "System" is resolved by CSS
  // (styles/colors.scss).
  const { theme } = await getMyPreferences();

  return (
    <html
      lang={locale}
      data-theme={theme}
      className={`${hankenGrotesk.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <IconBundle />
        {/* Messages/locale are picked up automatically from the server configuration. */}
        <NextIntlClientProvider>
          <UIProvider>
            {/* The dock sits inside the modal provider: its panel needs to
                know whether a modal is stacked above it so it can yield Escape. */}
            <ModalProvider>
              <DockProvider>{children}</DockProvider>
            </ModalProvider>
          </UIProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
