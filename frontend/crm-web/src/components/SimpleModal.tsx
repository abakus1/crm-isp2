// frontend/crm-web/src/components/SimpleModal.tsx
"use client";

import React from "react";

export function SimpleModal({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  className,
}: {
  open: boolean;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  className?: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div
        className={[
          "relative w-full max-w-lg rounded-xl border border-border bg-card shadow-xl",
          className || "",
        ].join(" ")}
      >
        <div className="p-4 border-b border-border">
          <div className="text-sm font-semibold">{title}</div>
          {description ? (
            <div className="text-xs text-muted-foreground mt-1">{description}</div>
          ) : null}
        </div>

        <div className="p-4 space-y-3">{children}</div>

        {footer ? <div className="p-4 border-t border-border">{footer}</div> : null}
      </div>
    </div>
  );
}