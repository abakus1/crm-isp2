// frontend/crm-web/src/components/SimpleModal.tsx
"use client";

import React, { useEffect } from "react";

export function SimpleModal({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  className,
  bodyClassName,
  headerExtra,
}: {
  open: boolean;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  className?: string;
  bodyClassName?: string;
  headerExtra?: React.ReactNode;
}) {
  // blokada scrolla body gdy modal otwarty
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* OVERLAY */}
      <div
        className="fixed inset-0 z-[1000] bg-black/55"
        onClick={onClose}
      />

      {/* MODAL WRAPPER */}
      <div className="fixed inset-0 z-[1001] flex items-center justify-center p-4">
        <div
          className={[
            "modal-surface relative w-full max-w-lg rounded-xl border border-border shadow-lg",
            className || "",
          ].join(" ")}
        >
          {/* HEADER */}
          <div className="p-4 border-b border-border">
            <div className="text-sm font-semibold">{title}</div>
            {description ? (
              <div className="text-xs text-muted-foreground mt-1">
                {description}
              </div>
            ) : null}
            {headerExtra ? <div className="mt-3">{headerExtra}</div> : null}
          </div>

          {/* BODY */}
          <div className={bodyClassName || "p-4 space-y-3"}>
            {children}
          </div>

          {/* FOOTER */}
          {footer ? (
            <div className="p-4 border-t border-border bg-[rgb(var(--surface-2))]">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}