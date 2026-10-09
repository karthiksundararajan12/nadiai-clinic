"use client";

import {
  Calendar,
  CreditCard,
  Gear,
  Microphone,
  SquaresFour,
  Syringe,
  Users,
} from "@phosphor-icons/react";

export const DASHBOARD_NAV_ICON_MAP = {
  LayoutDashboard: SquaresFour,
  Mic: Microphone,
  CalendarDays: Calendar,
  CreditCard,
  Users,
  Syringe,
  Settings: Gear,
};

export function DashboardNavIcon({ iconKey, active = false, className }) {
  const Icon = DASHBOARD_NAV_ICON_MAP[iconKey];
  if (!Icon) return null;
  return (
    <Icon
      size={22}
      weight="duotone"
      className={className}
      color={active ? "currentColor" : undefined}
      aria-hidden
    />
  );
}
