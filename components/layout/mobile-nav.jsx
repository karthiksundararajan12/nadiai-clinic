"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/constants";
import { filterNavItems } from "@/lib/specialization-nav";
import { Badge } from "@/components/ui/badge";
import { useUser } from "@/hooks/use-user";
import { DashboardNavIcon } from "@/components/layout/dashboard-nav-icons.jsx";
import {
  confirmRecordingLeave,
  shouldBlockNavigation,
} from "@/features/scribe/recording/recording-guard.js";

const DashboardMenuContext = createContext(null);

export function useDashboardMenu() {
  return useContext(DashboardMenuContext);
}

export function DashboardMenuProvider({ children }) {
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const value = useMemo(
    () => ({ open, setOpen, menuButtonRef }),
    [open],
  );

  return (
    <DashboardMenuContext.Provider value={value}>
      {children}
      <MobileNav />
    </DashboardMenuContext.Provider>
  );
}

function MobileNav() {
  const menu = useDashboardMenu();
  const open = menu?.open ?? false;
  const setOpen = menu?.setOpen;
  const menuButtonRef = menu?.menuButtonRef;
  const pathname = usePathname();
  const router = useRouter();
  const { specialization } = useUser();
  const visibleNavItems = filterNavItems(NAV_ITEMS, specialization);
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);

  const close = useCallback(() => {
    setOpen?.(false);
  }, [setOpen]);

  const navigateIfAllowed = (href, event) => {
    if (!shouldBlockNavigation(pathname, href)) return true;
    event?.preventDefault();
    if (confirmRecordingLeave()) {
      router.push(href);
      return true;
    }
    return false;
  };

  useEffect(() => {
    close();
  }, [pathname, close]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (media.matches) close();
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [close]);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const frame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      menuButtonRef?.current?.focus();
    };
  }, [open, close, menuButtonRef]);

  return (
    <div className="lg:hidden">
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity duration-300",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={close}
        aria-hidden="true"
      />
      <div
        id="dashboard-nav-drawer"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Main navigation"
        aria-hidden={!open}
        inert={open ? undefined : true}
        tabIndex={-1}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] flex-col bg-sidebar-background text-sidebar-foreground shadow-clinical transition-transform duration-300",
          open ? "translate-x-0" : "pointer-events-none -translate-x-full",
        )}
        style={{ boxShadow: "var(--sidebar-shadow)" }}
      >
        <div className="flex items-center border-b border-sidebar-border px-4 py-4">
          <Link
            href="/dashboard"
            onClick={(event) => {
              if (navigateIfAllowed("/dashboard", event)) close();
            }}
            className="inline-block min-w-0 flex-1"
          >
            <Image
              src="/nadiai-header.png"
              alt="Nadi AI"
              width={200}
              height={48}
              priority
              className="h-10 w-auto object-contain object-left"
            />
          </Link>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            className="toolbar-icon-button shrink-0 cursor-pointer"
            aria-label="Close menu"
          >
            <X size={20} weight="bold" aria-hidden />
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto p-3">
          <ul className="flex flex-col gap-1">
            {visibleNavItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href));

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={(event) => {
                      if (navigateIfAllowed(item.href, event)) close();
                    }}
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
