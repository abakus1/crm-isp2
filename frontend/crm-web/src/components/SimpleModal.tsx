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

  // ESC zamyka modal
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* OVERLAY (trochę lżej, żeby light nie robił “nocy”) */}
      <div className="fixed inset-0 z-[1000] bg-black/45" onClick={onClose} />

      {/* WRAPPER: scroll po prawej stronie jeśli nie mieści się w oknie */}
      <div className="fixed inset-0 z-[1001] overflow-y-auto overflow-x-hidden p-4">
        <div className="min-h-full flex items-start md:items-center justify-center">
          {/* SURFACE */}
          <div
            className={[
              "relative w-full rounded-xl border border-border shadow-xl",
              "max-h-[calc(100vh-2rem)]",
              "flex flex-col",
              "overflow-hidden overflow-x-hidden",
              // ✅ stonowane, czytelne w light i dark: polegamy na theme
              "bg-background text-foreground",
              className || "",
            ].join(" ")}
            role="dialog"
            aria-modal="true"
          >
            {/* HEADER */}
            <div className="shrink-0 border-b border-border bg-muted/30">
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{title}</div>
                    {description ? (
                      <div className="text-xs text-muted-foreground mt-1">{description}</div>
                    ) : null}
                  </div>

                  <button
                    onClick={onClose}
                    className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted/60"
                    aria-label="Zamknij"
                  >
                    ✕
                  </button>
                </div>

                {headerExtra ? <div className="mt-3">{headerExtra}</div> : null}
              </div>
            </div>

            {/* BODY (scroll w środku) */}
            <div
              className={[
                "flex-1 overflow-y-auto overflow-x-hidden",
                "p-4 space-y-3",
                bodyClassName || "",
              ].join(" ")}
            >
              {children}
            </div>

            {/* FOOTER */}
            {footer ? (
              <div className="shrink-0 border-t border-border bg-muted/20 p-4">{footer}</div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}