"use client";

import { useEffect, useState } from "react";
import { APP_VERSION, description, title } from "@/lib/whatsNew";

const STORAGE_KEY = "swahili_flashcards_whats_new_version";

export default function WhatsNewToast() {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const seenVersion = localStorage.getItem(STORAGE_KEY);

        if (seenVersion === APP_VERSION) {
            return;
        }

        const timer = window.setTimeout(() => {
            setOpen(true);
            localStorage.setItem(STORAGE_KEY, APP_VERSION);
        }, 0);

        return () => window.clearTimeout(timer);
    }, []);

    if (!open) return null;

    return (
        <div className="fixed bottom-4 right-4 z-50 w-[calc(100%-2rem)] max-w-sm rounded-2xl border bg-surface p-4 shadow-soft">
            <p className="text-sm font-semibold text-primary">{title}</p>
            <p className="mt-1 text-sm text-muted">{description}</p>
            <button
                type="button"
                className="btn btn-primary mt-3 w-full"
                onClick={() => setOpen(false)}
            >
                Alles klar
            </button>
        </div>
    );
}
