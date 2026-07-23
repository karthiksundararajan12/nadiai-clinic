"use client";

import { useCallback, useEffect, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  CreditCard,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { SearchInput } from "@/components/shared/search-input";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
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
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "custom", label: "Custom range" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "captured", label: "Captured" },
  { value: "failed", label: "Failed" },
  { value: "refunded", label: "Refunded" },
  { value: "pending", label: "Pending" },
];

const STATUS_PILL = {
  paid: "border-success/30 bg-success/10 text-success",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
  refunded: "border-border bg-muted text-muted-foreground",
  pending: "border-warning/30 bg-warning/10 text-warning",
};

export default function PaymentsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [range, setRange] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);
  const [payments, setPayments] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openingInvoice, setOpeningInvoice] = useState(null);

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

      const response = await fetch(`/api/payments?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load payments");
      }
      setPayments(Array.isArray(payload.payments) ? payload.payments : []);
      setTotal(Number(payload.total) || 0);
      setHasMore(Boolean(payload.hasMore));
    } catch (loadError) {
      setError(loadError);
      setPayments([]);
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

  async function openInvoice(payment) {
    if (!payment.hasInvoicePdf) return;
    setOpeningInvoice(payment.appointmentId);
    try {
      const response = await fetch(
        `/api/payments/${payment.appointmentId}/invoice`,
        { cache: "no-store" },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? "Invoice unavailable");
      }
      window.open(payload.url, "_blank", "noopener,noreferrer");
    } catch (invoiceError) {
      setError(invoiceError);
    } finally {
      setOpeningInvoice(null);
    }
  }

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + payments.length, total);
  const canPrev = offset > 0;
  const canNext = hasMore;

  return (
    <>
      <Header
        title="Payments"
        subtitle="Razorpay captures and invoice history for your clinic"
      />

      <div className="flex-1 space-y-4 p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <SearchInput
              value={searchInput}
              onChange={setSearchInput}
              placeholder="Search patient or payment ID…"
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
                      className="w-[160px]"
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
              <Label className="text-xs text-muted-foreground">Date</Label>
              <Select value={range} onValueChange={updateRange}>
                {({ open, setOpen, value, onValueChange }) => (
                  <>
                    <SelectTrigger
                      open={open}
                      onClick={() => setOpen(!open)}
                      className="w-[160px]"
                    >
                      {RANGE_OPTIONS.find((o) => o.value === value)?.label ?? "Date"}
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

          <p className="text-sm text-muted-foreground">
            {loading ? "Loading…" : `${total} payment${total === 1 ? "" : "s"}`}
          </p>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error.message}</p>
        )}

        {loading ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Loading payments…
          </p>
        ) : payments.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="No payments found"
            description="Try adjusting search or filters. Captured Razorpay payments appear here."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Patient</th>
                    <th className="px-4 py-3 font-medium">Appointment</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Payment ID</th>
                    <th className="px-4 py-3 font-medium">Invoice</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium text-foreground">
                        {payment.patientName}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {payment.slotLabel ?? "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-foreground">
                        {formatAmount(payment.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                            STATUS_PILL[payment.paymentStatus] ??
                              "border-border bg-muted text-muted-foreground",
                          )}
                        >
                          {payment.paymentStatusLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {payment.razorpayPaymentId ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {payment.invoiceNumber ? (
                          payment.hasInvoicePdf ? (
                            <button
                              type="button"
                              onClick={() => openInvoice(payment)}
                              disabled={openingInvoice === payment.appointmentId}
                              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline disabled:opacity-60"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              {payment.invoiceNumber}
                              <ExternalLink className="h-3 w-3 opacity-70" />
                            </button>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              {payment.invoiceNumber}
                            </span>
                          )
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        <div title={formatAbsolute(payment.createdAt)}>
                          {formatRelative(payment.createdAt)}
                        </div>
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
                  <ChevronLeft className="h-4 w-4" />
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
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function formatAmount(amount) {
  if (amount == null || !Number.isFinite(Number(amount))) return "—";
  const n = Number(amount);
  return `₹${Number.isInteger(n) ? String(n) : n.toFixed(2)}`;
}

function formatRelative(iso) {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

function formatAbsolute(iso) {
  try {
    return format(new Date(iso), "dd MMM yyyy, h:mm a");
  } catch {
    return iso ?? "";
  }
}
