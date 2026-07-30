"use client";

/**
 * @fileoverview Combobox — a searchable/filterable dropdown that still
 * accepts arbitrary free-text values.
 *
 * This codebase doesn't pull in a headless component library for
 * interactive dropdowns (see components/ui/select.jsx, dialog.jsx,
 * tabs.jsx, tooltip.jsx — all hand-rolled with plain useState + a
 * click-outside listener), so this follows that same pattern rather than
 * introducing a new one (e.g. @base-ui/react's Combobox primitive, which
 * is already a dependency but only used — indirectly, via shadcn's
 * template — to build components/ui/button.jsx, not for anything
 * dropdown-shaped).
 *
 * Unlike Select, the trigger IS the text input: `value` is both what's
 * displayed/typed AND the field's actual value, so typing something with
 * no matching option is simply free text — there is no "must pick from
 * the list" restriction. The option list underneath is filtered as you
 * type and is purely a set of suggestions/shortcuts.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { filterComboboxOptions } from "@/lib/combobox-options";

/**
 * @param {{
 *   value: string;
 *   onValueChange: (value: string) => void;
 *   options: ReadonlyArray<string>;
 *   id?: string;
 *   placeholder?: string;
 *   disabled?: boolean;
 *   emptyMessage?: string;
 *   emptyQueryHint?: string;
 *   className?: string;
 *   inputClassName?: string;
 *   maxSuggestions?: number;
 *   showAllOnEmpty?: boolean;
 *   onFocusField?: () => void;
 * }} props
 */
function Combobox({
  value,
  onValueChange,
  options,
  id,
  placeholder,
  disabled,
  emptyMessage = "No matches — you can still use this as a custom entry.",
  emptyQueryHint = "Type to search…",
  className,
  inputClassName,
  maxSuggestions,
  showAllOnEmpty = true,
  onFocusField,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const query = (value ?? "").trim();
  const filteredOptions = useMemo(
    () =>
      filterComboboxOptions(options, query, {
        maxSuggestions,
        showAllOnEmpty,
      }),
    [options, query, maxSuggestions, showAllOnEmpty],
  );

  const showEmptyQueryHint = open && !query && !showAllOnEmpty;
  const showNoMatches =
    open && Boolean(query) && filteredOptions.length === 0;
  const showOptions = open && filteredOptions.length > 0;

  return (
    <div ref={ref} className={cn("relative", open && "z-50", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          className={cn("pl-8", inputClassName)}
          placeholder={placeholder}
          value={value ?? ""}
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          onChange={(event) => onValueChange(event.target.value)}
          onFocus={() => {
            setOpen(true);
            onFocusField?.();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
        />
      </div>
      {(showEmptyQueryHint || showNoMatches || showOptions) && (
        <div className="absolute z-[100] mt-1 max-h-64 w-full overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95">
          {showEmptyQueryHint && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">{emptyQueryHint}</p>
          )}
          {showNoMatches && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">{emptyMessage}</p>
          )}
          {showOptions &&
            filteredOptions.map((option) => (
              <button
                key={option}
                type="button"
                className={cn(
                  "relative flex w-full cursor-pointer select-none items-center rounded-md py-1.5 px-2 text-sm outline-none hover:bg-accent/10 focus:bg-accent/10",
                  option === value && "bg-primary/5 text-primary"
                )}
                onClick={() => {
                  onValueChange(option);
                  setOpen(false);
                }}
              >
                <span className="flex-1 text-left">{option}</span>
                {option === value && <Check className="h-4 w-4 text-primary" />}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

export { Combobox };
