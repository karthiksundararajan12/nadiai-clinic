"use client";

import { useCallback, useState } from "react";
import {
  Undo2,
  Redo2,
  Search,
  Replace,
  Wand2,
  Split,
  Merge,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * TranscriptEditingToolbar - Advanced editing controls for transcript
 * Features: undo/redo, find/replace, batch corrections, split/merge
 */
export function TranscriptEditingToolbar({
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onFindReplace,
  onBatchCorrect,
  onShowAdvanced,
  disabled = false,
  segmentCount = 0,
}) {
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");

  const handleFindReplace = useCallback(() => {
    if (findText.trim()) {
      onFindReplace?.({
        find: findText,
        replace: replaceText,
      });
      setFindText("");
      setReplaceText("");
      setShowFindReplace(false);
    }
  }, [findText, replaceText, onFindReplace]);

  const handleKeyDown = useCallback((e) => {
    if (showFindReplace) {
      if (e.key === "Enter") {
        handleFindReplace();
      } else if (e.key === "Escape") {
        setShowFindReplace(false);
      }
    }
  }, [showFindReplace, handleFindReplace]);

  return (
    <div className="flex flex-col gap-2 border-b border-border/50 bg-muted/30 px-3 py-2">
      {/* Main toolbar */}
      <div className="flex items-center gap-2 justify-between">
        <div className="flex items-center gap-1">
          {/* Undo/Redo */}
          <div className="flex items-center gap-1 border-r border-border/30 pr-2 mr-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={onUndo}
              disabled={disabled || !canUndo}
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={onRedo}
              disabled={disabled || !canRedo}
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 className="h-4 w-4" />
            </Button>
          </div>

          {/* Find/Replace */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2"
            onClick={() => setShowFindReplace(!showFindReplace)}
            disabled={disabled || segmentCount === 0}
            title="Find and Replace"
          >
            <Search className="h-4 w-4" />
            <span className="text-xs hidden sm:inline">Find</span>
          </Button>

          {/* Batch corrections */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2"
            onClick={onBatchCorrect}
            disabled={disabled || segmentCount === 0}
            title="Batch correct common transcription errors"
          >
            <Wand2 className="h-4 w-4" />
            <span className="text-xs hidden sm:inline">Auto-fix</span>
          </Button>

          {/* Advanced options */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2"
            onClick={onShowAdvanced}
            disabled={disabled || segmentCount === 0}
            title="Split, merge, and other advanced options"
          >
            <span className="text-xs">Advanced</span>
          </Button>
        </div>

        {/* Info */}
        <div className="text-xs text-muted-foreground">
          {segmentCount} segments
        </div>
      </div>

      {/* Find/Replace UI */}
      {showFindReplace && (
        <div className="flex gap-2 items-end py-2 border-t border-border/30">
          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Find
            </label>
            <input
              type="text"
              value={findText}
              onChange={(e) => setFindText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search text…"
              className="h-8 w-full rounded border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              autoFocus
            />
          </div>
          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Replace
            </label>
            <input
              type="text"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Replace with…"
              className="h-8 w-full rounded border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <Button
            size="sm"
            className="h-8"
            onClick={handleFindReplace}
            disabled={!findText.trim()}
          >
            Replace All
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2"
            onClick={() => setShowFindReplace(false)}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Helpful hints */}
      {segmentCount === 0 && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
          <p>Transcript editing features will be available once transcription is complete.</p>
        </div>
      )}
    </div>
  );
}

export default TranscriptEditingToolbar;
