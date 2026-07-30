"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldOff } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Header } from "@/components/layout/header";
import { buttonVariants } from "@/components/ui/button";
import { useUser } from "@/hooks/use-user";
import { canAccessPath } from "@/lib/specialization-nav";
import { cn } from "@/lib/utils";

/**
 * Client-side gate for specialization-restricted dashboard routes.
 * Shows a clear "not applicable" state when the logged-in doctor's
 * specialization does not match NAV_SPECIALIZATION_REQUIREMENTS for the
 * current path (e.g. non-pediatric doctor hitting /vaccinations).
 */
export function SpecializationRouteGuard({
  children,
  title = "Not available",
  description = "This section is not available for your specialization.",
}) {
  const pathname = usePathname();
  const { specialization, loading } = useUser();

  if (loading) {
    return (
      <>
        <Header title={title} />
        <div className="flex flex-1 items-center justify-center p-6 text-sm font-medium text-muted-foreground">
          Loading…
        </div>
      </>
    );
  }

  if (!canAccessPath(pathname, specialization)) {
    return (
      <>
        <Header title={title} />
        <div className="flex-1 p-6">
          <EmptyState
            icon={ShieldOff}
            title="Not applicable for your specialization"
            description={description}
            action={
              <Link
                href="/dashboard"
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                Back to dashboard
              </Link>
            }
          />
        </div>
      </>
    );
  }

  return children;
}
