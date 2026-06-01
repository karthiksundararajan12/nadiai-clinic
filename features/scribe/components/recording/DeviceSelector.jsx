"use client";

/**
 * DeviceSelector — dropdown for choosing the audio input device.
 *
 * Hidden when only one device is available (or enumeration is unsupported).
 * Labels are only populated after mic permission is granted.
 */

import { Mic, ChevronDown, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * @param {{
 *   devices:            import("../../recording/use-device-selection.js").AudioDevice[];
 *   selectedDeviceId:   string;
 *   onChange:           (deviceId: string) => void;
 *   disabled?:          boolean;
 *   isLoading?:         boolean;
 *   onRefresh?:         () => void;
 *   className?:         string;
 * }} props
 */
export function DeviceSelector({
  devices,
  selectedDeviceId,
  onChange,
  disabled   = false,
  isLoading  = false,
  onRefresh,
  className,
}) {
  // Hide when there's only one device — no choice to make
  if (devices.length <= 1 && !isLoading) return null;

  const getLabel = (device, index) => {
    if (device.label) return device.label;
    // Before permission is granted, labels are empty
    return `Microphone ${index + 1}`;
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Mic className="size-4 text-slate-400 flex-shrink-0" />

      <div className="relative flex-1 min-w-[180px]">
        <select
          value={selectedDeviceId}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || isLoading}
          aria-label="Select microphone"
          className={cn(
            "w-full appearance-none rounded-lg border border-slate-700",
            "bg-slate-800/80 text-slate-200 text-sm px-3 py-1.5 pr-8",
            "focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60",
            "transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
            "cursor-pointer",
          )}
        >
          {devices.map((device, i) => (
            <option key={device.deviceId} value={device.deviceId}>
              {getLabel(device, i)}
            </option>
          ))}
        </select>

        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 size-3.5 text-slate-400"
        />
      </div>

      {/* Refresh button — visible after permission denied then re-granted */}
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={disabled || isLoading}
          aria-label="Refresh device list"
          title="Refresh device list"
          className={cn(
            "rounded-md p-1.5 text-slate-400 hover:text-slate-200",
            "hover:bg-slate-700 transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          <RefreshCw className={cn("size-3.5", isLoading && "animate-spin")} />
        </button>
      )}
    </div>
  );
}
