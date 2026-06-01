"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import {
  Copy,
  Download,
  FileText,
  CheckCircle,
} from "lucide-react";
import { useState } from "react";

export function ScribeNotes({
  clinicalNote,
  isGeneratingNote,
  error,
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(clinicalNote);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-accent" />
          <CardTitle className="text-base">SOAP Note</CardTitle>
        </div>
        {clinicalNote && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleCopy}
            >
              {copied ? (
                <CheckCircle className="h-3.5 w-3.5 text-success" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button variant="ghost" size="icon-xs">
              <Download className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="flex-1 overflow-auto">
        {isGeneratingNote ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <LoadingSpinner />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                Loading SOAP note...
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Please wait while the clinical workspace refreshes.
              </p>
            </div>
          </div>
        ) : clinicalNote ? (
          <div className="prose prose-sm max-w-none">
            <div
              className="text-sm leading-relaxed text-foreground whitespace-pre-wrap"
              dangerouslySetInnerHTML={{
                __html: clinicalNote
                  .replace(/## (.*)/g, '<h3 class="text-base font-semibold mt-4 mb-2 text-foreground">$1</h3>')
                  .replace(/### (.*)/g, '<h4 class="text-sm font-semibold mt-3 mb-1 text-foreground">$1</h4>')
                  .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
                  .replace(/^\d+\. (.*)/gm, '<div class="ml-4 mb-1">$&</div>')
                  .replace(/^- (.*)/gm, '<div class="ml-4 mb-0.5 text-muted-foreground">- $1</div>'),
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-accent/10 p-3 mb-3">
              <FileText className="h-6 w-6 text-accent" />
            </div>
            <p className="text-sm font-medium text-foreground">
              SOAP note has not been generated.
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[260px]">
              {error || "SOAP note has not been generated."}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
