import { clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * `--text-title/heading/body/caption` are font-size tokens, but tailwind-merge
 * treats unknown `text-*` classes as colors. Without this, `text-caption` on
 * `size="sm"` buttons strips `text-primary-foreground` and primary labels
 * inherit body gray on indigo.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": ["text-title", "text-heading", "text-body", "text-caption"],
    },
  },
});

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
