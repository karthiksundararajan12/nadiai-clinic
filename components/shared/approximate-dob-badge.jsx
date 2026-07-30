"use client";

import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Small, muted data-quality hint shown next to a rendered date of birth (or
 * a vaccination due date computed from one) whose date_of_birth_is_approximate
 * flag is true — i.e. it was derived from an age reply rather than a real
 * DOB (see parseAgeOrDob / PatientCollectionService). Not an error state,
 * so it deliberately stays low-contrast rather than using a warning color.
 */
export function ApproximateDobBadge({ className }) {
  return (
    <Tooltip
      content="Derived from age at registration — actual date of birth not provided."
      side="top"
      className="max-w-[240px] whitespace-normal text-center"
    >
      <Badge
        variant="secondary"
        className={cn("cursor-help text-[10px] font-medium text-muted-foreground", className)}
      >
        Approximate
      </Badge>
    </Tooltip>
  );
}
