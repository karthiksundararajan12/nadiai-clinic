import { JetBrains_Mono } from "next/font/google";
import { appFontDisplay, appFontSans } from "@/lib/app-fonts";
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

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${appFontSans.variable} ${appFontDisplay.variable} ${jetbrainsMono.variable} h-full`}
    >
      <body className="min-h-full bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
