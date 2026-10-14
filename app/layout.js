import { JetBrains_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { appFontDisplay, appFontSans, appFontTamil, appFontTelugu } from "@/lib/app-fonts";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata = {
  title: "Nadi AI - Clinical Assistant",
  description:
    "AI-powered clinical assistant with Hinglish scribe and patient management for modern healthcare professionals.",
};

export default async function RootLayout({ children }) {
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      className={`${appFontSans.variable} ${appFontDisplay.variable} ${appFontTamil.variable} ${appFontTelugu.variable} ${jetbrainsMono.variable} h-full`}
    >
      <body className="min-h-full bg-background font-sans antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
