"use client";

import { GitCompare, History } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

export function SOAPVersionHistoryPanel({ versions, onCompare }) {
  const [selected, setSelected] = useState([]);
  const sorted = useMemo(() => versions ?? [], [versions]);

  function toggle(versionId) {
    setSelected((current) => {
      if (current.includes(versionId)) return current.filter((id) => id !== versionId);
      return [...current.slice(-1), versionId];
    });
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4" />
          SOAP versions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          variant="outline"
          size="sm"
          disabled={selected.length !== 2}
          onClick={() => onCompare(selected[0], selected[1])}
        >
          <GitCompare className="size-4" />
          Compare selected
        </Button>
        <ScrollArea className="max-h-[420px] pr-2">
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">No SOAP versions yet.</p>
          ) : (
            <ul className="space-y-3">
              {sorted.map((version) => (
                <li key={version.id} className="rounded-lg border p-3">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected.includes(version.id)}
                      onChange={() => toggle(version.id)}
                      className="mt-1"
                      aria-label={`Select SOAP version ${version.version_number}`}
                    />
                    <span>
                      <span className="block text-sm font-medium">
                        Version {version.version_number} · {version.source ?? "ai_generated"}
                        {version.is_approved_version ? " · Approved snapshot" : ""}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {new Date(version.created_at).toLocaleString()}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {version.diff_metadata?.changedSectionCount ?? 0} changed sections
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
