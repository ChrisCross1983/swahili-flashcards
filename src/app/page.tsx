"use client";

import { useEffect, useState } from "react";

const KEY_NAME = "ramona_owner_key";
const IMAGE_BASE_URL =
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-images`;

function getOrCreateOwnerKey() {
  let k = localStorage.getItem(KEY_NAME);
  if (!k) {
    k = crypto.randomUUID();
    localStorage.setItem(KEY_NAME, k);
  }
  return k;
}

export default function Home() {
  const [ownerKey, setOwnerKey] = useState("");
  const [german, setGerman] = useState("");
  const [swahili, setSwahili] = useState("");
  const [status, setStatus] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [cards, setCards] = useState<any[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [todayItems, setTodayItems] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reveal, setReveal] = useState(false);
  const [direction, setDirection] = useState<"DE_TO_SW" | "SW_TO_DE">("DE_TO_SW");
  const [wrongCounts, setWrongCounts] = useState<Record<string, number>>({});
  const [duplicateHint, setDuplicateHint] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    setOwnerKey(getOrCreateOwnerKey());
  }, []);

  useEffect(() => {
  if (!imageFile) {
    setPreviewUrl(null);
    return;
  }
  const url = URL.createObjectURL(imageFile);
  setPreviewUrl(url);
  return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  async function uploadImage(): Promise<string | null> {
  if (!imageFile) return null;

  const formData = new FormData();
  formData.append("file", imageFile);

  const res = await fetch("/api/upload-image", {
    method: "POST",
    body: formData,
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error ?? "Upload failed");
  }

  return json.path as string;
}

async function createCard(skipWarning = false) {
  try {

    // Warnung nur beim ersten Versuch
    if (!skipWarning) {
      const exists = await checkExistingGerman();
      if (exists) {
        setStatus(""); // Status leeren, Warnbox übernimmt
        return;
      }
    }

    setStatus("Speichere...");

    const imagePath = await uploadImage();

    const res = await fetch("/api/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ownerKey,
        german,
        swahili,
        imagePath,
      }),
    });

    const json = await res.json();

    if (!res.ok) {
      console.error(json.error);

      // Wenn Duplikat: lieber als deutliche Warnbox anzeigen
      if (res.status === 409) {
        setDuplicateHint(json.error ?? "Diese Karte existiert bereits.");
        setStatus("");
        return;
      }

      setStatus(json.error ?? "Speichern fehlgeschlagen");
      return;
    }

    setStatus(`Gespeichert ✅ (id: ${json.card.id})`);
    setGerman("");
    setSwahili("");
    setImageFile(null);
    setDuplicateHint(null);
    await loadCards();
  } catch (e: any) {
    setStatus(`Fehler: ${e.message}`);
  }
}

async function updateCard() {
  try {
    setDuplicateHint(null);
    setStatus("Speichere...");

    const res = await fetch("/api/cards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ownerKey,
        id: editingId,
        german,
        swahili,
      }),
    });

    const json = await res.json();

    if (!res.ok) {
      console.error(json.error);
      if (res.status === 409) {
        setDuplicateHint(json.error ?? "Diese Karte existiert bereits.");
        setStatus("");
        return;
      }
      setStatus(json.error ?? "Aktualisieren fehlgeschlagen.");
      return;
    }

    setStatus("Gespeichert ✅");
    setEditingId(null);
    setGerman("");
    setSwahili("");
    setImageFile(null);

    await loadCards();
  } catch (e: any) {
    setStatus(e.message ?? "Aktualisieren fehlgeschlagen.");
  }
}

function saveCard() {
  if (editingId) {
    return updateCard();
  }
  return createCard();
}

async function loadCards() {
  setStatus("Lade Karten...");
  const res = await fetch(`/api/cards?ownerKey=${encodeURIComponent(ownerKey)}`);
  const json = await res.json();

  if (!res.ok) {
    setStatus(json.error ?? "Aktion fehlgeschlagen.");
    return;
  }

  setCards(json.cards);
  setStatus(`Geladen ✅ (${json.cards.length})`);
}

function startEdit(card: any) {
  setEditingId(card.id);
  setGerman(card.german_text ?? "");
  setSwahili(card.swahili_text ?? "");
  setDuplicateHint(null);
  setStatus("");
}

function cancelEdit() {
  setEditingId(null);
  setGerman("");
  setSwahili("");
  setImageFile(null);
  setDuplicateHint(null);
  setStatus("");
}

async function checkExistingGerman(): Promise<boolean> {
  const res = await fetch("/api/cards/check-existing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ownerKey,
      german,
    }),
  });

  const json = await res.json();

  if (!res.ok) {
    console.error(json.error);
    return false;
  }

  if (json.exists) {
    setDuplicateHint(
      `Hinweis: Für „${german}“ gibt es bereits Karten. Prüfe kurz, ob es eine Variante oder ein Tippfehler ist.`
    );
    return true;
  }

  return false;
}

async function deleteCard(id: string) {
  const yes = confirm("Karte wirklich löschen?");
  if (!yes) return;

  setStatus("Lösche...");
  const res = await fetch(
    `/api/cards?ownerKey=${encodeURIComponent(ownerKey)}&id=${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );

  const json = await res.json();
  if (!res.ok) {
    setStatus(json.error ?? "Aktion fehlgeschlagen.");
    return;
  }

  setStatus("Gelöscht ✅");
  await loadCards();
}

async function loadToday() {
  setStatus("Lade fällige Karten...");
  const res = await fetch(`/api/learn/today?ownerKey=${encodeURIComponent(ownerKey)}`);
  const json = await res.json();

  if (!res.ok) {
    setStatus(json.error ?? "Aktion fehlgeschlagen.");
    return;
  }

  setTodayItems(json.items);
  setCurrentIndex(0);
  setReveal(false);
  setStatus(`Fällig heute: ${json.items.length}`);
}

async function gradeCurrent(correct: boolean) {
  const item = todayItems[currentIndex];
  if (!item) return;

  const res = await fetch("/api/learn/grade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ownerKey,
      cardId: item.cardId,
      correct,
      currentLevel: item.level,
    }),
  });

  const json = await res.json();
  if (!res.ok) {
    setStatus(json.error ?? "Aktion fehlgeschlagen.");
    return;
  }

  // ---- Requeue-Logik (nur wenn falsch) ----
  if (!correct) {
    const id = item.cardId;
    const count = (wrongCounts[id] ?? 0) + 1;

    setWrongCounts((prev) => ({ ...prev, [id]: count }));

    // max 2 Wiederholungen pro Session (sonst kann man hängen bleiben)
    if (count <= 2) {
      // ans Ende hängen
      setTodayItems((prev) => [...prev, item]);
    }
  }

  // nächste Karte
  const nextIndex = currentIndex + 1;

  if (nextIndex >= todayItems.length) {
    setStatus("Session fertig ✅");
    setReveal(false);
    // optional: direkt neu laden, damit fällige Karten weg sind
    await loadToday();
  } else {
    setCurrentIndex(nextIndex);
    setReveal(false);
  }
}

  return (
    <main className="min-h-screen p-6 flex justify-center">
      <div className="w-full max-w-xl">
        <h1 className="text-2xl font-semibold">Swahili Flashcards (MVP)</h1>
        <p className="text-sm text-gray-600 mt-1">
          Owner-Key: <span className="font-mono">{ownerKey || "..."}</span>
        </p>

        <div className="mt-6 rounded-2xl border p-4 shadow-sm bg-white">
          <label className="block text-sm font-medium">Deutsch</label>
          <input
            className="mt-1 w-full rounded-xl border p-3"
            value={german}
            onChange={(e) => setGerman(e.target.value)}
            placeholder="z.B. Guten Morgen"
          />

          <label className="block text-sm font-medium mt-4">Swahili</label>
          <input
            className="mt-1 w-full rounded-xl border p-3"
            value={swahili}
            onChange={(e) => setSwahili(e.target.value)}
            placeholder="z.B. Habari za asubuhi"
          />

          <label className="block text-sm font-medium mt-4">Bild (optional)</label>
          <input
            type="file"
            accept="image/*"
            className="mt-1 w-full"
            onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
          />

          {previewUrl && (
            <div className="mt-3">
              <p className="text-xs text-gray-500 mb-2">Vorschau</p>
              <img
                src={previewUrl}
                alt="Vorschau"
                className="w-40 h-40 object-cover rounded-xl border"
              />
            </div>
          )}

          {duplicateHint && (
            <div className="mt-4 rounded-xl border border-yellow-400 bg-yellow-50 p-3 text-sm">
              <p>{duplicateHint}</p>

              <div className="mt-2 flex gap-2">
                <button
                  className="rounded-lg border px-3 py-1"
                  onClick={() => {
                    setDuplicateHint(null);
                  }}
                >
                  Korrigieren
                </button>

                <button
                  className="rounded-lg bg-black text-white px-3 py-1"
                  onClick={() => createCard(true)}
                >
                  Trotzdem speichern
                </button>
              </div>
            </div>
          )}

          <button
            className="mt-4 w-full rounded-xl bg-black text-white p-3 disabled:opacity-50"
            onClick={() => saveCard()}
            disabled={!ownerKey || !german || !swahili}
          >
            {editingId ? "Änderungen speichern" : "Karte speichern"}
          </button>

          {editingId && (
            <button
              className="mt-2 w-full rounded-xl border p-3"
              onClick={() => cancelEdit()}
            >
              Bearbeiten abbrechen
            </button>
          )}

          <button
            className="mt-3 w-full rounded-xl border p-3"
            onClick={() => loadCards()}
            disabled={!ownerKey}
          >
            Karten laden
          </button>

          {status && (
            <div className="mt-3 rounded-xl border p-3 text-sm bg-white">
              {status}
            </div>
          )}

          <div className="mt-6 rounded-2xl border p-4 bg-white">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">Lernen</p>

              <select
                className="border rounded-lg p-2 text-sm"
                value={direction}
                onChange={(e) => setDirection(e.target.value as any)}
              >
                <option value="DE_TO_SW">Deutsch → Swahili</option>
                <option value="SW_TO_DE">Swahili → Deutsch</option>
              </select>
            </div>

            <button
              className="mt-3 w-full rounded-xl border p-3"
              onClick={() => loadToday()}
              disabled={!ownerKey}
            >
              Heute fällige Karten laden
            </button>

            {todayItems.length === 0 ? (
              <p className="mt-3 text-sm text-gray-600">Keine Karten fällig 🎉</p>
            ) : (
              <div className="mt-4 rounded-xl border p-4">
                <p className="text-xs text-gray-500">
                  Karte {currentIndex + 1} / {todayItems.length} (Level {todayItems[currentIndex]?.level})
                </p>

                <div className="mt-3 text-lg font-semibold">
                  {direction === "DE_TO_SW"
                    ? todayItems[currentIndex]?.german
                    : todayItems[currentIndex]?.swahili}
                </div>

                {todayItems[currentIndex]?.imagePath && (
                  <img
                    src={`${IMAGE_BASE_URL}/${todayItems[currentIndex].imagePath}`}
                    alt="Kartenbild"
                    className="mt-4 w-full max-w-xs rounded-xl border object-cover"
                  />
                )}

                {reveal && (
                  <div className="mt-3 text-lg">
                    {direction === "DE_TO_SW"
                      ? todayItems[currentIndex]?.swahili
                      : todayItems[currentIndex]?.german}
                  </div>
                )}

                <div className="mt-4 flex gap-2">
                  {!reveal ? (
                    <button
                      className="w-full rounded-xl bg-black text-white p-3"
                      onClick={() => setReveal(true)}
                    >
                      Umdrehen
                    </button>
                  ) : (
                    <>
                      <button
                        className="w-full rounded-xl border p-3"
                        onClick={() => gradeCurrent(false)}
                      >
                        ❌ Nicht gewusst
                      </button>
                      <button
                        className="w-full rounded-xl bg-black text-white p-3"
                        onClick={() => gradeCurrent(true)}
                      >
                        ✅ Gewusst
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 space-y-3">
            {cards.map((c) => (
              <div key={c.id} className="rounded-xl border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm font-medium">
                    {c.german_text} — {c.swahili_text}
                  </div>

                  <div className="flex gap-2">
                    <button
                      className="text-sm px-3 py-1 rounded-lg border"
                      onClick={() => startEdit(c)}
                      disabled={!ownerKey}
                      title="Bearbeiten"
                    >
                      ✏️
                    </button>

                    <button
                      className="text-sm px-3 py-1 rounded-lg border"
                      onClick={() => deleteCard(c.id)}
                      disabled={!ownerKey}
                      title="Löschen"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {c.image_path && (
                  <div className="mt-2 text-xs text-gray-500">
                    Bild gespeichert: {c.image_path}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
