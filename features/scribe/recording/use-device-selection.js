"use client";

/**
 * @fileoverview useDeviceSelection — enumerates audio input devices and
 * refreshes automatically when devices are plugged / unplugged.
 *
 * Device labels are only populated AFTER mic permission is granted; call
 * refreshDevices() inside the recording hook once permission is obtained.
 *
 * Usage:
 *   const { devices, selectedDeviceId, setSelectedDeviceId, refreshDevices } =
 *     useDeviceSelection();
 */

import { useState, useEffect, useCallback, useRef } from "react";

/**
 * @typedef {Object} AudioDevice
 * @property {string} deviceId
 * @property {string} label
 * @property {string} groupId
 */

/**
 * @returns {{
 *   devices: AudioDevice[];
 *   selectedDeviceId: string;
 *   setSelectedDeviceId: (id: string) => void;
 *   refreshDevices: () => Promise<void>;
 *   isLoading: boolean;
 *   isSupported: boolean;
 * }}
 */
export function useDeviceSelection() {
  const [devices,          setDevices]          = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [isLoading,        setIsLoading]        = useState(false);
  const mountedRef = useRef(true);

  const isSupported =
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.enumerateDevices === "function";

  const refreshDevices = useCallback(async () => {
    if (!isSupported) return;

    setIsLoading(true);
    try {
      const all    = await navigator.mediaDevices.enumerateDevices();
      const inputs = all.filter((d) => d.kind === "audioinput");

      if (!mountedRef.current) return;

      setDevices(inputs);

      // Auto-select the first real device.
      // "default" is a virtual mirror on Windows — prefer the first non-default.
      setSelectedDeviceId((prev) => {
        if (prev && inputs.some((d) => d.deviceId === prev)) return prev;
        const preferred =
          inputs.find((d) => d.deviceId !== "default") ?? inputs[0];
        return preferred?.deviceId ?? "";
      });
    } catch (err) {
      console.warn("[useDeviceSelection] Failed to enumerate devices:", err?.message);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [isSupported]);

  useEffect(() => {
    mountedRef.current = true;
    queueMicrotask(() => refreshDevices());

    const handler = () => refreshDevices();
    navigator.mediaDevices?.addEventListener("devicechange", handler);

    return () => {
      mountedRef.current = false;
      navigator.mediaDevices?.removeEventListener("devicechange", handler);
    };
  }, [refreshDevices]);

  return {
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    refreshDevices,
    isLoading,
    isSupported,
  };
}
