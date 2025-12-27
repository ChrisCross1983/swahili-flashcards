"use client";

import { useRouter } from "next/navigation";

const CATEGORIES = [
  { slug: "basics", title: "Basics", level: 1, description: "Hallo, Bitte, Danke …" },
  { slug: "numbers", title: "Zahlen", level: 2, description: "1–100, Uhrzeiten …" },
  { slug: "food", title: "Essen & Trinken", level: 3, description: "Restaurant, Einkaufen …" },
];

export default function PathClient() {
  const router = useRouter();

  return (
    <main className="min-h-screen p-6 flex justify-center">
      <div className="w-full max-w-xl">
        <h1 className="text-2xl font-semibold">Lernpfad</h1>
        <p className="mt-1 text-sm text-gray-600">
          Wähle eine Kategorie (leicht → schwer).
        </p>

        <div className="mt-6 space-y-3">
          {CATEGORIES.sort((a, b) => a.level - b.level).map((c) => (
            <button
              key={c.slug}
              className="w-full rounded-2xl border p-4 text-left hover:shadow-sm transition"
              onClick={() => router.push(`/path/${c.slug}`)}
            >
              <div className="font-semibold">{c.title}</div>
              <div className="text-sm text-gray-600">{c.description}</div>
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
    </main>
  );
}
