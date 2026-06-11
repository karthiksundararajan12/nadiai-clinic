"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import {
  LayoutDashboard,
  Mic,
  CalendarDays,
  Users,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";

const ICON_MAP = {
  LayoutDashboard,
  Mic,
  CalendarDays,
  Users,
  Settings,
};

export function MobileNav({ open, onClose }) {
  const pathname = usePathname();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="fixed inset-0 bg-black/50 glass" onClick={onClose} />
      <div className="fixed inset-y-0 left-0 w-[280px] bg-white text-gray-900 shadow-xl animate-in slide-in-from-left dark:bg-gray-950 dark:text-gray-100">
        <div className="flex h-[100px] items-center justify-between border-b border-gray-200 px-4 dark:border-gray-800">
          <Image
            src="/logo.svg"
            alt="Nadi AI"
            width={740}
            height={205}
            priority
            unoptimized
            className="w-full max-w-[228px] h-auto object-contain"
          />
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="p-3">
          <ul className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const Icon = ICON_MAP[item.icon];
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href));

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                        : "text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                    )}
                  >
                    {Icon && (
                      <Icon
                        className={cn(
                          "h-[18px] w-[18px]",
                          isActive
                            ? "text-primary"
                            : "text-gray-400 dark:text-gray-500"
                        )}
                      />
                    )}
                    <span className="flex-1">{item.title}</span>
                    {item.badge && (
                      <Badge
                        variant="accent"
                        className="h-5 px-1.5 text-[10px] font-semibold"
                      >
                        {item.badge}
                      </Badge>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}
