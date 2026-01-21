"use client";

import { useRouter } from "next/navigation";

const CATEGORIES = [
  {
    slug: "basics",
    title: "Basics",
    level: 1,
    description: "Hallo, Bitte, Danke …",
    enabled: true,
  },
  {
    slug: "travel",
    title: "Reisen",
    level: 2,
    description: "Unterwegs, Weg fragen …",
    enabled: false,
  },
  {
    slug: "nominal-classes-intro",
    title: "🌱 Nominalklassen – Einstieg",
    level: 3,
    description: "Wortanfänge erkennen – ohne Grammatikstress.",
    enabled: true,
  },
  {
    slug: "home",
    title: "Wohnen",
    level: 4,
    description: "Haus, Alltag, Dinge …",
    enabled: false,
  },
  {
    slug: "work",
    title: "Arbeit",
    level: 5,
    description: "Office, Meetings …",
    enabled: false,
  },
  {
    slug: "sentences",
    title: "Sätze & Übungen",
    level: 6,
    description: "Nominalklassen, Struktur …",
    enabled: false,
  },
];

export default function PathClient() {
  const router = useRouter();

  return (
    <main className="min-h-screen p-6 flex justify-center">
      <div className="w-full max-w-xl">
        <h1 className="text-2xl font-semibold">Lernpfad</h1>
        <p className="mt-1 text-sm text-muted">
          Wähle eine Kategorie (leicht → schwer).
        </p>

        <div className="mt-6 space-y-3">
          {CATEGORIES.sort((a, b) => a.level - b.level).map((c) => (
            <button
              key={c.slug}
              className={`w-full rounded-2xl border p-4 text-left transition ${c.enabled ? "hover:shadow-soft" : "opacity-50 cursor-not-allowed"
                }`}
              onClick={() => {
                if (!c.enabled) return;
                router.push(`/path/${c.slug}`);
              }}
              type="button"
            >
              <div className="font-semibold flex items-center gap-2">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-sm ${c.enabled ? "" : "bg-surface"
                    }`}
                >
                  {c.level}
                </span>
                {c.title}
              </div>
              <div className="text-sm text-muted">{c.description}</div>
            </button>
          ))}
        </div>

        <button
          className="mt-8 rounded-xl border px-4 py-2 text-sm"
          onClick={() => router.push("/")}
        >
          ← Zurück
        </button>
      </div>
    </main >
  );
}
