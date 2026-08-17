"use client";

import { useEffect } from "react";
import Link from "next/link";
import AppRouteState from "@/components/AppRouteState";

type TrainerErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function TrainerError({ error, reset }: TrainerErrorProps) {
  useEffect(() => {
    console.error("Trainer route failed", error);
  }, [error]);

  return (
    <AppRouteState
      eyebrow="Training"
      title="Der Trainer konnte nicht geladen werden"
      description="Das hat gerade nicht geklappt. Deine Karten wurden dadurch nicht verändert."
    >
      <button type="button" className="btn btn-primary min-h-12" onClick={reset}>
        Erneut versuchen
      </button>
      <Link className="btn btn-secondary min-h-12" href="/">
        Zur Startseite
      </Link>
    </AppRouteState>
  );
}
