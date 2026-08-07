"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  CUSTOM_CHIP_VALUE,
  buildFieldChipOptions,
  commitCustomFieldValue,
  fieldValuesEqual,
  resolveSelectedChipValue,
  selectFieldChip,
} from "@/features/scribe/lib/prescription-field-ranges.js";

/**
 * Tap-not-type chip picker for dose / frequency / duration.
 * Editing updates local draft via onChange; save/approve stays with the parent.
 *
 * @param {object} props
 * @param {string} props.value
 * @param {(next: string) => void} props.onChange
 * @param {ReadonlyArray<string>} props.presets
 * @param {string} [props.placeholder]
 * @param {string} [props.testId]
 * @param {boolean} [props.disabled]
 */
export function PrescriptionFieldChips({
  value,
  onChange,
  presets,
  placeholder = "Custom value",
  testId,
  disabled = false,
}) {
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState("");

  const selected = resolveSelectedChipValue({
    currentValue: value,
    presets,
    customMode,
  });
  const options = buildFieldChipOptions({
    currentValue: value,
    presets,
    includeCustom: true,
  });

  // Keep custom draft text in sync when parent value changes from outside.
  useEffect(() => {
    if (!customMode) {
      setCustomText(value ?? "");
    }
  }, [value, customMode]);

  const handleSelect = (chipValue) => {
    if (disabled) return;
    const result = selectFieldChip({
      currentValue: value,
      chipValue,
      presets,
      customMode,
    });
    setCustomMode(result.customMode);
    if (result.customMode) {
      setCustomText(result.value);
      return;
    }
    if (!fieldValuesEqual(result.value, value)) {
      onChange(result.value);
    }
  };

  const handleCustomCommit = () => {
    const result = commitCustomFieldValue(customText);
    setCustomMode(false);
    if (!fieldValuesEqual(result.value, value)) {
      onChange(result.value);
    }
  };

  return (
    <div className="space-y-2" data-testid={testId}>
      <div className="flex flex-wrap gap-2" role="listbox" aria-label="Field options">
        {options.map((opt) => {
          const isSelected = selected === opt.value
            || (opt.kind !== "custom" && fieldValuesEqual(opt.value, selected));
          const isRange = opt.kind === "range";
          return (
            <button
              key={`${opt.kind}:${opt.value}`}
              type="button"
              role="option"
              aria-selected={isSelected}
              disabled={disabled}
              data-chip-kind={opt.kind}
              data-selected={isSelected ? "true" : "false"}
              onClick={() => handleSelect(opt.value)}
              className={cn(
                "cursor-pointer rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                "disabled:cursor-not-allowed disabled:opacity-50",
                isSelected
                  ? isRange
                    ? "border-amber-500 bg-amber-50 text-amber-900 ring-1 ring-amber-400/60"
                    : "border-primary bg-primary/10 text-primary"
                  : isRange
                    ? "border-amber-200 bg-amber-50/40 text-amber-800 hover:bg-amber-50"
                    : opt.kind === "custom"
                      ? "border-dashed border-gray-300 text-gray-600 hover:bg-gray-50"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {customMode || selected === CUSTOM_CHIP_VALUE ? (
        <Input
          value={customText}
          disabled={disabled}
          placeholder={placeholder}
          className="text-sm"
          data-testid={testId ? `${testId}-custom` : undefined}
          onChange={(e) => {
            setCustomText(e.target.value);
            setCustomMode(true);
            onChange(e.target.value);
          }}
          onBlur={handleCustomCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleCustomCommit();
            }
          }}
        />
      ) : null}
    </div>
  );
}
