"use client";

import { History, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

export function VersionHistoryPanel({ versions, onRestore, disabled }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4" />
          Version history
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-[420px] pr-2">
          {versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No saved versions yet.</p>
          ) : (
            <ul className="space-y-3">
              {versions.map((version) => (
                <li key={version.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        {version.label || `Version ${version.version_number}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(version.created_at).toLocaleString()}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {version.change_summary?.segmentCount ?? 0} segments · {version.source}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onRestore(version.id)}
                      disabled={disabled}
                      aria-label={`Restore ${version.label || `version ${version.version_number}`}`}
                    >
                      <RotateCcw className="size-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
