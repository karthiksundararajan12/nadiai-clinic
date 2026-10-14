import { Inter, Noto_Sans_Tamil, Noto_Sans_Telugu, Plus_Jakarta_Sans } from "next/font/google";

export const appFontSans = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

export const appFontDisplay = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  display: "swap",
});

export const appFontTamil = Noto_Sans_Tamil({
  variable: "--font-tamil",
  subsets: ["tamil"],
  weight: ["500", "600", "700"],
  display: "swap",
});

export const appFontTelugu = Noto_Sans_Telugu({
  variable: "--font-telugu",
  subsets: ["telugu"],
  weight: ["500", "600", "700"],
  display: "swap",
});
