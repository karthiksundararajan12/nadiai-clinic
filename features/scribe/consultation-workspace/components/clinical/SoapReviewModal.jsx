"use client";

import { RefreshCw, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function SoapReviewModal({ open, onOpenChange, onRegenerate, onEditManually }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onClose={() => onOpenChange?.(false)}>
        <DialogHeader>
          <DialogTitle>Review SOAP Note</DialogTitle>
          <DialogDescription>
            This SOAP note has not been approved. Choose how you would like to proceed.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col sm:items-stretch">
          <Button
            type="button"
            className="w-full cursor-pointer gap-2 bg-primary hover:bg-primary/90"
            onClick={onRegenerate}
            data-testid="soap-reject-regenerate"
          >
            <RefreshCw className="h-4 w-4" />
            Regenerate SOAP Note
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full cursor-pointer gap-2"
            onClick={onEditManually}
            data-testid="soap-reject-edit-manually"
          >
            <Pencil className="h-4 w-4" />
            Edit Manually
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full cursor-pointer gap-2 text-gray-600"
            onClick={() => onOpenChange?.(false)}
          >
            <X className="h-4 w-4" />
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
