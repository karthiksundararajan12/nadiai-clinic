"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function ReviewLoadingState() {
  return (
    <Card>
      <CardContent className="flex min-h-64 items-center justify-center gap-3 p-8 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        Loading transcript…
      </CardContent>
    </Card>
  );
}

export function ReviewErrorState({ error, onRetry }) {
  return (
    <Card className="border-destructive/40">
      <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
        <AlertCircle className="size-8 text-destructive" />
        <div>
          <p className="font-medium">Unable to load transcript review</p>
          <p className="text-sm text-muted-foreground">{error?.message || "Please try again."}</p>
        </div>
        <Button variant="outline" onClick={onRetry}>Retry</Button>
      </CardContent>
    </Card>
  );
}

export function EmptyTranscriptState() {
  return (
    <Card>
      <CardContent className="p-8 text-center text-sm text-muted-foreground">
        No transcript segments found for this session.
      </CardContent>
    </Card>
  );
}
