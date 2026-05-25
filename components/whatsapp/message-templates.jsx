"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WHATSAPP_TEMPLATES } from "@/lib/constants";
import { Copy, Edit, MessageSquareText } from "lucide-react";
import { useState } from "react";

export function MessageTemplates() {
  const [copiedId, setCopiedId] = useState(null);

  const handleCopy = (id, message) => {
    navigator.clipboard.writeText(message);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div className="flex items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Message Templates</CardTitle>
        </div>
        <Badge variant="secondary">{WHATSAPP_TEMPLATES.length} templates</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {WHATSAPP_TEMPLATES.map((template) => (
          <div
            key={template.id}
            className="rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">
                {template.name}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleCopy(template.id, template.message)}
                >
                  <Copy
                    className={`h-3 w-3 ${
                      copiedId === template.id ? "text-success" : ""
                    }`}
                  />
                </Button>
                <Button variant="ghost" size="icon-xs">
                  <Edit className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
              {template.message}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
