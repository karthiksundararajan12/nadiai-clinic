"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export function SOAPSectionEditor({ sectionKey, label, value, originalValue, dirty, disabled, onChange }) {
  const modified = (originalValue ?? "") !== (value ?? "");

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{label}</CardTitle>
          <div className="flex gap-2">
            {modified && <Badge variant="warning">Modified</Badge>}
            {dirty && <Badge variant="secondary">Unsaved</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Textarea
          value={value ?? ""}
          onChange={(event) => onChange(sectionKey, event.target.value)}
          disabled={disabled}
          rows={sectionKey === "clinicalSummary" ? 6 : 5}
          aria-label={`${label} editor`}
          className="min-h-32 resize-y leading-6"
        />
      </CardContent>
    </Card>
  );
}
