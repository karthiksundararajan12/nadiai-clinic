"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/constants";
import { filterNavItems } from "@/lib/specialization-nav";
import { Badge } from "@/components/ui/badge";
import { useUser } from "@/hooks/use-user";
import { DashboardNavIcon } from "@/components/layout/dashboard-nav-icons.jsx";

export function MobileNav({ open, onClose }) {
  const pathname = usePathname();
  const { specialization } = useUser();
  const visibleNavItems = filterNavItems(NAV_ITEMS, specialization);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="fixed inset-0 bg-black/50 glass" onClick={onClose} />
      <div
        className="fixed inset-y-0 left-0 w-[280px] animate-in slide-in-from-left bg-sidebar-background text-sidebar-foreground shadow-clinical"
        style={{ boxShadow: "var(--sidebar-shadow)" }}
      >
        <div className="flex items-center">
          <Link href="/dashboard" onClick={onClose} className="min-w-0 flex-1">
            <Image
              src="/nadiai-header.png"
              alt="Nadi AI"
              width={260}
              height={72}
              priority
              className="h-[72px] w-full object-contain object-left"
            />
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="toolbar-icon-button shrink-0 cursor-pointer"
            aria-label="Close menu"
          >
            <X size={20} weight="bold" aria-hidden />
          </button>
        </div>

        <nav className="p-3">
          <ul className="flex flex-col gap-1">
            {visibleNavItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href));

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      "group flex h-11 items-center gap-3 rounded-xl px-3 text-nav font-semibold transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-primary-soft hover:text-primary",
                    )}
                  >
                    <DashboardNavIcon
                      iconKey={item.icon}
                      active={isActive}
                      className={cn(
                        isActive ? "text-primary-foreground" : "text-icon-muted group-hover:text-primary",
                      )}
                    />
                    <span className="flex-1">{item.title}</span>
                    {item.badge && (
                      <Badge
                        variant={item.badge === "AI" ? "ai" : "accent"}
                        className="h-6 px-2.5 text-caption font-bold"
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
