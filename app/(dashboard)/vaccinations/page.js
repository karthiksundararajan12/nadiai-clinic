"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  Syringe,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";
import { ICON_SIZE_MD, ICON_STROKE } from "@/lib/icons";
import { Header } from "@/components/layout/header";
import { SearchInput } from "@/components/shared/search-input";
import { EmptyState } from "@/components/shared/empty-state";
import { ApproximateDobBadge } from "@/components/shared/approximate-dob-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 300;

const RANGE_OPTIONS = [
  { value: "all", label: "All time" },
  { value: "today", label: "Due today" },
  { value: "week", label: "Due this week" },
  { value: "month", label: "Due this month" },
  { value: "overdue", label: "Overdue" },
  { value: "custom", label: "Custom range" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "reminder_sent", label: "Reminder sent" },
  { value: "completed", label: "Completed" },
  { value: "overdue", label: "Overdue" },
];

const STATUS_PILL = {
  pending: "border-warning/30 bg-warning/10 text-warning",
  reminder_sent: "border-primary/30 bg-primary/10 text-primary",
  completed: "border-success/30 bg-success/10 text-success",
  overdue: "border-destructive/30 bg-destructive/10 text-destructive",
};

export default function VaccinationsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [range, setRange] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);
  const [vaccinations, setVaccinations] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setOffset(0);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(offset));
      params.set("status", status);
      params.set("range", range);
      if (search) params.set("search", search);
      if (range === "custom") {
        if (from) params.set("from", from);
        if (to) params.set("to", to);
      }

      const response = await fetch(`/api/vaccinations?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load vaccinations");
      }
      setVaccinations(Array.isArray(payload.vaccinations) ? payload.vaccinations : []);
      setTotal(Number(payload.total) || 0);
      setHasMore(Boolean(payload.hasMore));
    } catch (loadError) {
      setError(loadError);
      setVaccinations([]);
      setTotal(0);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [offset, status, range, search, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateStatus(next) {
    setStatus(next);
    setOffset(0);
  }

  function updateRange(next) {
    setRange(next);
    setOffset(0);
  }

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + vaccinations.length, total);
  const canPrev = offset > 0;
  const canNext = hasMore;

  return (
    <>
      <Header
        title="Vaccinations"
        subtitle="Upcoming and overdue vaccination reminders for your clinic"
      />

      <div className="flex-1 space-y-4 p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <SearchInput
              value={searchInput}
              onChange={setSearchInput}
              placeholder="Search patient or vaccine…"
              className="w-full sm:w-72"
            />

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={status} onValueChange={updateStatus}>
                {({ open, setOpen, value, onValueChange }) => (
                  <>
                    <SelectTrigger
                      open={open}
                      onClick={() => setOpen(!open)}
                      className="w-[170px]"
                    >
                      {STATUS_OPTIONS.find((o) => o.value === value)?.label ?? "Status"}
                    </SelectTrigger>
                    <SelectContent open={open}>
                      {STATUS_OPTIONS.map((option) => (
                        <SelectItem
                          key={option.value}
                          value={option.value}
                          selected={option.value === value}
                          onSelect={() => {
                            onValueChange(option.value);
                            setOpen(false);
                          }}
                        >
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </>
                )}
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Due date</Label>
              <Select value={range} onValueChange={updateRange}>
                {({ open, setOpen, value, onValueChange }) => (
                  <>
                    <SelectTrigger
                      open={open}
                      onClick={() => setOpen(!open)}
                      className="w-[170px]"
                    >
                      {RANGE_OPTIONS.find((o) => o.value === value)?.label ?? "Due date"}
                    </SelectTrigger>
                    <SelectContent open={open}>
                      {RANGE_OPTIONS.map((option) => (
                        <SelectItem
                          key={option.value}
                          value={option.value}
                          selected={option.value === value}
                          onSelect={() => {
                            onValueChange(option.value);
                            setOpen(false);
                          }}
                        >
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </>
                )}
              </Select>
            </div>

            {range === "custom" && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">From</Label>
                  <Input
                    type="date"
                    value={from}
                    onChange={(e) => {
                      setFrom(e.target.value);
                      setOffset(0);
                    }}
                    className="w-[150px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">To</Label>
                  <Input
                    type="date"
                    value={to}
                    onChange={(e) => {
                      setTo(e.target.value);
                      setOffset(0);
                    }}
                    className="w-[150px]"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">
              {loading ? "Loading…" : `${total} vaccination${total === 1 ? "" : "s"}`}
            </p>
            <Link
              href="/vaccinations/new"
              className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
            >
              <Plus className="h-3.5 w-3.5" />
              Add vaccination
            </Link>
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error.message}</p>
        )}

        {loading ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Loading vaccinations…
          </p>
        ) : vaccinations.length === 0 ? (
          <EmptyState
            icon={Syringe}
            title="No vaccinations found"
            description="Try adjusting search or filters, or add a vaccination reminder for a patient."
            action={
              <Link
                href="/vaccinations/new"
                className={cn(buttonVariants({ size: "sm" }))}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add vaccination
              </Link>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[840px] text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Patient</th>
                    <th className="px-4 py-3 font-medium">Vaccine</th>
                    <th className="px-4 py-3 font-medium">Due date</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Reminder sent</th>
                    <th className="px-4 py-3 font-medium">Added</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {vaccinations.map((vaccination) => (
                    <tr key={vaccination.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium text-foreground">
                        {vaccination.patientName}
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        {vaccination.vaccineName}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <span>{formatDate(vaccination.dueDate)}</span>
                          {vaccination.patientDateOfBirthIsApproximate && <ApproximateDobBadge />}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                            STATUS_PILL[vaccination.status] ??
                              "border-border bg-muted text-muted-foreground",
                          )}
                        >
                          {vaccination.statusLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {vaccination.reminderSentAt
                          ? formatDateTime(vaccination.reminderSentAt)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {formatDateTime(vaccination.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <p className="text-xs text-muted-foreground">
                Showing {pageStart}–{pageEnd} of {total}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canPrev || loading}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  className="gap-1"
                >
                  <ChevronLeft className={ICON_SIZE_MD} strokeWidth={ICON_STROKE} />
                  Prev
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canNext || loading}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  className="gap-1"
                >
                  Next
                  <ChevronRight className={ICON_SIZE_MD} strokeWidth={ICON_STROKE} />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function formatDate(value) {
  if (!value) return "—";
  try {
    return format(new Date(`${value}T00:00:00+05:30`), "dd MMM yyyy");
  } catch {
    return value;
  }
}

function formatDateTime(iso) {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "dd MMM yyyy, h:mm a");
  } catch {
    return iso;
  }
}
