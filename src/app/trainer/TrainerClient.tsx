"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";

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

export default function TrainerClient() {
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [ownerKey, setOwnerKey] = useState("");
    const [german, setGerman] = useState("");
    const [swahili, setSwahili] = useState("");
    const [status, setStatus] = useState("");
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [cards, setCards] = useState<any[]>([]);
    const [search, setSearch] = useState("");
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [todayItems, setTodayItems] = useState<any[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [reveal, setReveal] = useState(false);
    const [direction, setDirection] = useState<"DE_TO_SW" | "SW_TO_DE">("DE_TO_SW");
    const [wrongCounts, setWrongCounts] = useState<Record<string, number>>({});
    const [duplicateHint, setDuplicateHint] = useState<string | null>(null);
    const [duplicatePreview, setDuplicatePreview] = useState<any | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editSource, setEditSource] = useState<"cards" | "create">("create");
    const [openLearn, setOpenLearn] = useState(false);
    const [openCards, setOpenCards] = useState(false);
    const [openCreate, setOpenCreate] = useState(false);
    const [learnStarted, setLearnStarted] = useState(false);
    const [directionMode, setDirectionMode] = useState<"DE_TO_SW" | "SW_TO_DE" | "RANDOM">("DE_TO_SW");

    const router = useRouter();

    useEffect(() => {
        setOwnerKey(getOrCreateOwnerKey());
    }, []);

    useEffect(() => {
        (async () => {
            const supabase = supabaseBrowser();
            const { data } = await supabase.auth.getUser();
            setUserEmail(data.user?.email ?? null);
        })();
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

            showToast("Karte gespeichert ✅");
            setGerman("");
            setSwahili("");
            setImageFile(null);
            setDuplicateHint(null);
            setDuplicatePreview(null);
            await loadCards(undefined, { silent: true });
        } catch (e: any) {
            setStatus(`Fehler: ${e.message}`);
        }
    }

    async function updateCard() {
        try {
            setDuplicateHint(null);
            setStatus("Speichere...");

            let imagePath: string | undefined = undefined;
            if (imageFile) {
                imagePath = (await uploadImage()) ?? undefined;
            }

            const body: any = {
                ownerKey,
                id: editingId,
                german,
                swahili,
            };

            if (imagePath) body.imagePath = imagePath;

            const res = await fetch("/api/cards", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
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

            showToast("Karte aktualisiert ✅");
            setEditingId(null);
            setGerman("");
            setSwahili("");
            setImageFile(null);

            await loadCards(undefined, { silent: true });

            setOpenCreate(false);
            setOpenCards(true);
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

    async function loadCards(q?: string, opts?: { silent?: boolean }) {
        const silent = opts?.silent ?? false;

        if (!silent) setStatus("Lade Karten...");

        const url =
            q && q.trim().length > 0
                ? `/api/cards?ownerKey=${encodeURIComponent(ownerKey)}&q=${encodeURIComponent(q)}`
                : `/api/cards?ownerKey=${encodeURIComponent(ownerKey)}`;

        const res = await fetch(url);
        const json = await res.json();

        if (!res.ok) {
            if (!silent) setStatus(json.error ?? "Aktion fehlgeschlagen.");
            return;
        }

        setCards(json.cards);

        if (!silent) setStatus("");
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

            setDuplicatePreview(json.cards ?? null);

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

        showToast("Karte gelöscht ✅");
        await loadCards(undefined, { silent: true });
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

            // Wenn RANDOM aktiv: pro Karte neu würfeln
            if (directionMode === "RANDOM") {
                setDirection(Math.random() < 0.5 ? "DE_TO_SW" : "SW_TO_DE");
            }
        }
    }

    async function logout() {
        const supabase = supabaseBrowser();
        await supabase.auth.signOut();
        window.location.href = "/login";
    }

    function showToast(message: string) {
        setStatus(message);
        window.setTimeout(() => setStatus(""), 2500);
    }

    const filteredCards = cards.filter((c) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return (
            (c.german_text ?? "").toLowerCase().includes(q) ||
            (c.swahili_text ?? "").toLowerCase().includes(q)
        );
    });

    const currentItem = todayItems[currentIndex] ?? null;

    const currentGerman =
        currentItem?.german_text ?? currentItem?.german ?? currentItem?.de ?? "";

    const currentSwahili =
        currentItem?.swahili_text ?? currentItem?.swahili ?? currentItem?.sw ?? "";

    const currentImagePath =
        currentItem?.image_path ?? currentItem?.imagePath ?? currentItem?.image ?? null;

    return (
        <main className="min-h-screen p-6 flex justify-center">
            <div className="w-full max-w-xl">
                <h1 className="text-2xl font-semibold">Swahili Flashcards (MVP)</h1>

                <div className="mt-3 flex items-center justify-between gap-3">
                    <button
                        className="rounded-xl border px-3 py-2 text-sm"
                        onClick={() => router.push("/")}
                    >
                        ← Home
                    </button>

                    <div className="text-xs text-gray-500">
                        Eingeloggt als: <span className="font-mono">{userEmail ?? "..."}</span>
                    </div>

                    <button className="rounded-xl border px-3 py-2 text-sm" onClick={logout}>
                        Logout
                    </button>
                </div>

                {/* Bubbles */}
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <button
                        onClick={() => {
                            setStatus("");
                            setReveal(false);
                            setLearnStarted(false);
                            setDirectionMode("DE_TO_SW");
                            setOpenLearn(true);
                            loadToday();
                        }}
                        className="rounded-[32px] border p-8 text-left shadow-sm hover:shadow transition"
                    >
                        <div className="text-xl font-semibold">Heute lernen</div>
                        <div className="mt-2 text-sm text-gray-600">
                            Starte deine fälligen Karten im Fokus-Modus.
                        </div>
                    </button>

                    <button
                        onClick={() => {
                            setStatus("");
                            setDuplicateHint(null);
                            setOpenCreate(true);
                        }}
                        className="rounded-[32px] border p-8 text-left shadow-sm hover:shadow transition"
                    >
                        <div className="text-xl font-semibold">Neue Wörter</div>
                        <div className="mt-2 text-sm text-gray-600">
                            Neue Karte anlegen (Deutsch ↔ Swahili).
                        </div>
                    </button>
                    <button
                        onClick={() => {
                            setStatus("");
                            setDuplicateHint(null);
                            setDuplicatePreview(null);
                            setOpenCards(true);
                            loadCards();
                        }}
                        className="rounded-[32px] border p-8 text-left shadow-sm hover:shadow transition"
                    >
                        <div className="text-xl font-semibold">Meine Karten</div>
                        <div className="mt-2 text-sm text-gray-600">
                            Durchsuchen, bearbeiten und aufräumen.
                        </div>
                    </button>
                </div>

                {/* Learn Modal */}
                <Modal
                    open={openLearn}
                    title="Heute lernen"
                    onClose={() => setOpenLearn(false)}
                >

                    {todayItems.length === 0 ? (
                        <p className="mt-4 text-sm text-gray-600">Keine Karten fällig 🎉</p>
                    ) : !learnStarted ? (
                        <div className="mt-4 rounded-2xl border p-4">
                            <div className="text-sm font-medium">Einstellungen</div>
                            <p className="mt-1 text-sm text-gray-600">
                                Wähle die Abfragerichtung – dann startest du.
                            </p>

                            <label className="block text-sm font-medium mt-4">Abfragerichtung</label>
                            <select
                                className="mt-1 w-full rounded-xl border p-3 text-sm"
                                value={directionMode}
                                onChange={(e) =>
                                    setDirectionMode(e.target.value as "DE_TO_SW" | "SW_TO_DE" | "RANDOM")
                                }
                            >
                                <option value="DE_TO_SW">Deutsch → Swahili</option>
                                <option value="SW_TO_DE">Swahili → Deutsch</option>
                                <option value="RANDOM">Zufällig (Abwechslung)</option>
                            </select>

                            <button
                                className="mt-4 w-full rounded-xl bg-black text-white p-3"
                                onClick={() => {
                                    // Direction festlegen
                                    const chosen =
                                        directionMode === "RANDOM"
                                            ? (Math.random() < 0.5 ? "DE_TO_SW" : "SW_TO_DE")
                                            : directionMode;

                                    setDirection(chosen);
                                    setReveal(false);
                                    setCurrentIndex(0);
                                    setLearnStarted(true);
                                }}
                            >
                                Start
                            </button>
                        </div>
                    ) : (
                        <div className="mt-4">
                            <div className="text-xs text-gray-500">
                                Karte {currentIndex + 1} / {todayItems.length}
                            </div>

                            <div className="mt-3 rounded-2xl border p-4">
                                {currentImagePath ? (
                                    <img
                                        src={`${IMAGE_BASE_URL}/${currentImagePath}`}
                                        alt="Bild"
                                        className="w-full max-h-64 object-cover rounded-xl border"
                                    />
                                ) : null}

                                <div className="mt-4 text-lg font-semibold">
                                    {direction === "DE_TO_SW" ? currentGerman : currentSwahili}
                                </div>

                                <div className="mt-3">
                                    {!reveal ? (
                                        <button
                                            className="w-full rounded-xl bg-black text-white p-3"
                                            onClick={() => setReveal(true)}
                                        >
                                            Aufdecken
                                        </button>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className="rounded-xl bg-gray-50 p-3 border">
                                                <div className="text-xs text-gray-500">Antwort</div>
                                                <div className="text-base font-medium">
                                                    {direction === "DE_TO_SW" ? currentSwahili : currentGerman}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3">
                                                <button
                                                    className="rounded-xl border p-3"
                                                    onClick={() => gradeCurrent(false)}
                                                >
                                                    Nicht gewusst
                                                </button>
                                                <button
                                                    className="rounded-xl bg-black text-white p-3"
                                                    onClick={() => gradeCurrent(true)}
                                                >
                                                    Gewusst
                                                </button>
                                            </div>

                                            <button
                                                className="w-full rounded-xl border p-3 text-sm"
                                                onClick={() => {
                                                    // zurück zum Setup, z.B. Richtung ändern oder neu starten
                                                    setLearnStarted(false);
                                                    setReveal(false);
                                                }}
                                            >
                                                Einstellungen ändern
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {status ? (
                                <div className="mt-4 rounded-xl border bg-white p-3 text-sm">
                                    {status}
                                </div>
                            ) : null}
                        </div>
                    )}
                </Modal>

                {/* Create Modal */}
                <Modal
                    open={openCreate}
                    title={editingId ? "Karte bearbeiten" : "Neue Wörter"}
                    onClose={() => {
                        setOpenCreate(false);
                        cancelEdit();
                    }}
                >
                    <div className="rounded-2xl border p-4 shadow-sm bg-white">
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

                        <label className="block text-sm font-medium mt-4 mb-1">
                            Bild hinzufügen
                        </label>

                        <input
                            type="file"
                            accept="image/*"
                            id="image-upload"
                            className="hidden"
                            onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                        />

                        <label
                            htmlFor="image-upload"
                            className="
                                flex items-center justify-center gap-3
                                rounded-2xl border-2 border-dashed
                                p-4 cursor-pointer
                                transition
                                hover:bg-gray-50 hover:border-gray-400
                            "
                        >
                            {previewUrl ? (
                                <>
                                    <img
                                        src={previewUrl}
                                        alt="Vorschau"
                                        className="w-16 h-16 object-cover rounded-xl border"
                                    />
                                    <div className="text-sm">
                                        <div className="font-medium">Bild ändern</div>
                                        <div className="text-xs text-gray-500">
                                            Tippen zum Austauschen
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="text-3xl">🖼️</div>
                                    <div className="text-sm">
                                        <div className="font-medium">Bild hinzufügen</div>
                                        <div className="text-xs text-gray-500">
                                            Tippen, um ein Bild auszuwählen
                                        </div>
                                    </div>
                                </>
                            )}
                        </label>

                        {duplicateHint && (
                            <div className="mt-4 rounded-xl border p-4 bg-yellow-50 space-y-3">
                                <p className="text-sm font-medium">{duplicateHint}</p>

                                {/* Vorschau vorhandener Karten */}
                                {Array.isArray(duplicatePreview) && duplicatePreview.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-xs text-gray-600">Bereits vorhandene Karten:</p>

                                        {duplicatePreview.slice(0, 5).map((c: any) => (
                                            <div
                                                key={c.id}
                                                className="flex items-center gap-3 rounded-lg border bg-white p-2"
                                            >
                                                {c.image_path ? (
                                                    <img
                                                        src={`${IMAGE_BASE_URL}/${c.image_path}`}
                                                        alt="Bild"
                                                        className="w-10 h-10 rounded-md object-cover border"
                                                    />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-md border bg-gray-100 flex items-center justify-center text-xs text-gray-400">
                                                        –
                                                    </div>
                                                )}

                                                <div className="text-sm">
                                                    <div className="font-medium">{c.german_text}</div>
                                                    <div className="text-gray-600">{c.swahili_text}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="flex gap-2 pt-2">
                                    <button
                                        className="flex-1 rounded-xl border px-3 py-2 text-sm"
                                        onClick={() => {
                                            setDuplicateHint(null);
                                            setDuplicatePreview(null);
                                        }}
                                    >
                                        Korrigieren
                                    </button>

                                    <button
                                        className="flex-1 rounded-xl bg-black text-white px-3 py-2 text-sm"
                                        onClick={() => createCard(true)}
                                    >
                                        Trotzdem speichern
                                    </button>
                                </div>
                            </div>
                        )}

                        <button
                            className="mt-4 w-full rounded-xl bg-black text-white p-3 disabled:opacity-50"
                            onClick={saveCard}
                            disabled={!german || !swahili}
                        >
                            {editingId ? "Änderungen speichern" : "Karte speichern"}
                        </button>

                        {status ? (
                            <div className="mt-4 rounded-xl border bg-white p-3 text-sm">
                                {status}
                            </div>
                        ) : null}
                    </div>
                </Modal>
                {/* My Cards Modal */}
                <Modal
                    open={openCards}
                    title="Meine Karten"
                    onClose={() => setOpenCards(false)}
                >
                    <div className="rounded-2xl border p-4 bg-white">
                        {/* Suche */}
                        <label className="block text-sm font-medium">Suchen</label>
                        <input
                            className="mt-1 w-full rounded-xl border p-3"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Deutsch oder Swahili…"
                        />
                        {status ? (
                            <div className="mt-3 rounded-xl border p-3 text-sm bg-gray-50">
                                {status}
                            </div>
                        ) : null}

                        <div className="mt-3 text-sm text-gray-500">
                            {cards.length} Karten
                        </div>

                        {/* Liste */}
                        <div className="mt-4 space-y-3">
                            {filteredCards.map((c) => (
                                <div key={c.id} className="rounded-xl border p-3">
                                    <div className="text-sm font-medium">
                                        {c.german_text} — {c.swahili_text}
                                    </div>

                                    {c.image_path ? (
                                        <div className="mt-2 flex items-center gap-3">
                                            <img
                                                src={`${IMAGE_BASE_URL}/${c.image_path}`}
                                                alt="Bild"
                                                className="w-12 h-12 object-cover rounded-lg border"
                                            />
                                            <span className="text-xs text-gray-500">Bild hinterlegt</span>
                                        </div>
                                    ) : (
                                        <div className="mt-2 text-xs text-gray-400">Kein Bild</div>
                                    )}

                                    <div className="mt-3 flex gap-2">
                                        <button
                                            className="rounded-xl border px-3 py-2 text-sm"
                                            onClick={() => {
                                                startEdit(c);
                                                setOpenCards(false);
                                                setOpenCreate(true);
                                            }}
                                        >
                                            Bearbeiten
                                        </button>

                                        <button
                                            className="rounded-xl border px-3 py-2 text-sm"
                                            onClick={() => deleteCard(c.id)}
                                        >
                                            Löschen
                                        </button>
                                    </div>
                                </div>
                            ))}

                            {filteredCards.length === 0 ? (
                                <p className="text-sm text-gray-600">Keine Treffer.</p>
                            ) : null}
                        </div>
                    </div>
                </Modal>

            </div >
        </main >
    );
}
