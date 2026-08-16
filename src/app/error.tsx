"use client";

import { useEffect } from "react";
import AppRouteState from "@/components/AppRouteState";

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("App route failed", error);
  }, [error]);

  return (
    <AppRouteState
      eyebrow="Fehler"
      title="Das hat gerade nicht geklappt"
      description="Bitte versuche es noch einmal. Wenn der Fehler bleibt, gehe zurück zur Startseite und starte die Ansicht neu."
    >
      <button type="button" className="btn btn-primary min-h-12" onClick={reset}>
        Erneut versuchen
      </button>
      <a className="btn btn-secondary min-h-12" href="/">
        Zur Startseite
      </a>
    </AppRouteState>
  );
}
