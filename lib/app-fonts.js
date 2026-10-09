import { Inter, Plus_Jakarta_Sans } from "next/font/google";

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
