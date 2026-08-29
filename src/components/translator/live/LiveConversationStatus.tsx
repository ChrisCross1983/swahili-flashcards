import type { LiveClientSnapshot } from "@/lib/translator/live/types";

const languageName = { de: "Deutsch", sw: "Kiswahili" } as const;

export default function LiveConversationStatus({ snapshot }: { snapshot: LiveClientSnapshot }) {
  let label = "Bereit – sprich einfach";
  let icon = "●";

  if (snapshot.phase === "connecting") label = "Live-Verbindung wird aufgebaut …";
  if (snapshot.phase === "recognizing") {
    label =
      snapshot.detectedLanguage === "unknown"
        ? "Sprache wird erkannt …"
        : `${languageName[snapshot.detectedLanguage]} wird erkannt …`;
  }
  if (snapshot.phase === "translating") {
    label = snapshot.targetLanguage
      ? `Übersetze ins ${languageName[snapshot.targetLanguage]} …`
      : "Übersetzung wird vorbereitet …";
  }
  if (snapshot.phase === "speaking") {
    icon = "🔊";
    label = snapshot.targetLanguage
      ? `${languageName[snapshot.targetLanguage]} wird gesprochen …`
      : "Übersetzung wird gesprochen …";
  }
  if (snapshot.phase === "error") {
    icon = "!";
    label = snapshot.error ?? "Live-Verbindung wurde unterbrochen.";
  }

  const tone =
    snapshot.phase === "error"
      ? "text-accent-danger-strong"
      : snapshot.phase === "speaking"
        ? "text-accent-success-strong"
        : "text-primary";

  return (
    <div className="flex min-h-48 flex-col items-center justify-center px-3 text-center" aria-live="polite">
      <span
        className={`flex h-16 w-16 items-center justify-center rounded-full border border-soft bg-surface text-2xl ${tone}`}
        aria-hidden="true"
      >
        {icon}
      </span>
      <p className={`mt-5 text-lg font-semibold ${tone}`}>{label}</p>
      {snapshot.phase === "listening" ? (
        <p className="mt-2 max-w-xs text-sm text-muted">Deutsch oder Kiswahili – ohne Knopfdruck pro Sprecherwechsel.</p>
      ) : null}
    </div>
  );
}

