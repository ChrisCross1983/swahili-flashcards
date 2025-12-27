"use client";

import { ReactNode, useEffect } from "react";

export default function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  // ESC schließt
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <button
        aria-label="Close overlay"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl border relative">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <div className="font-semibold">{title ?? ""}</div>
            <button
              className="rounded-xl border px-3 py-1 text-sm"
              onClick={onClose}
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="p-4 max-h-[80vh] overflow-auto">{children}</div>
        </div>
      </div>
    </div>
  );
}
