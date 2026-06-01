"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function SOAPReviewLoadingState() {
  return (
    <Card>
      <CardContent className="p-6 text-sm text-muted-foreground">Loading SOAP review workspace...</CardContent>
    </Card>
  );
}

export function SOAPReviewErrorState({ error, onRetry }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <p className="text-sm font-medium text-destructive">Unable to load SOAP review workspace.</p>
        <p className="text-sm text-muted-foreground">{error?.message ?? "Unknown error"}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>
      </CardContent>
    </Card>
  );
}

export function EmptySOAPState() {
  return (
    <Card>
      <CardContent className="p-6 text-sm text-muted-foreground">
        No SOAP note is available yet. Generate SOAP before opening review.
      </CardContent>
    </Card>
  );
}
