import type { LiveV2Snapshot } from "@/lib/translator/live/v2/types";

export default function LiveV2Status({ snapshot }: { snapshot: LiveV2Snapshot }) {
  let label = "Bereit – sprich einfach";
  let icon = "●";
  if (snapshot.phase === "connecting") label = "Live-Verbindung wird aufgebaut …";
  if (snapshot.phase === "recognizing") label = "Ich höre zu …";
  if (snapshot.phase === "translating") label = "Wird übersetzt …";
  if (snapshot.phase === "speaking") {
    icon = "🔊";
    label = "Wird gesprochen …";
  }
  if (snapshot.phase === "error") {
    icon = "!";
    label = snapshot.error ?? "Live-Verbindung wurde unterbrochen.";
  }

  return (
    <div className="flex min-h-44 flex-col items-center justify-center px-3 text-center" aria-live="polite">
      <span
        className="flex h-16 w-16 items-center justify-center rounded-full border border-soft bg-surface text-2xl text-primary"
        aria-hidden="true"
      >
        {icon}
      </span>
      <p className="mt-5 text-lg font-semibold text-primary">{label}</p>
      {snapshot.phase === "listening" ? (
        <p className="mt-2 max-w-xs text-sm text-muted">
          Deutsch oder Kiswahili – ohne Knopfdruck pro Sprecherwechsel.
        </p>
      ) : null}
    </div>
  );
}
