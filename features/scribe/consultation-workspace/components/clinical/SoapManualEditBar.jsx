"use client";

import { Loader2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SoapManualEditBar({ saving, onSave, onCancel }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <div>
        <p className="text-sm font-medium text-amber-900">Manual editing mode</p>
        <p className="text-xs text-amber-700">
          Update Subjective, Objective, Assessment, and Plan. Original AI output is preserved.
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="cursor-pointer gap-1.5"
          onClick={onCancel}
          disabled={saving}
        >
          <X className="h-3.5 w-3.5" />
          Cancel Editing
        </Button>
        <Button
          type="button"
          size="sm"
          className="cursor-pointer gap-1.5 bg-cyan-600 hover:bg-cyan-700"
          onClick={onSave}
          disabled={saving}
          data-testid="soap-save-manual-edits"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
