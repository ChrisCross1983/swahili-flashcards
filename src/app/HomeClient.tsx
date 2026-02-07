"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

const IMAGE_BASE_URL =
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-images`;

type Props = { ownerKey: string };

export default function HomeClient({ ownerKey }: Props) {
    const [userEmail, setUserEmail] = useState<string | null>(null);
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
    const [duplicateHint, setDuplicateHint] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [leitnerStats, setLeitnerStats] = useState<null | {
        total: number;
        dueTodayCount: number;
        dueTomorrowCount: number;
        dueLaterCount: number;
        nextDueInDays: number | null;
    }>(null);
    const router = useRouter();

    const leitnerUi = (() => {
        if (!leitnerStats) {
            return {
                total: 0,
                todayCount: 0,
                tomorrowCount: 0,
                laterCount: 0,
                nextText: "—",
            };
        }

        const total = Number(leitnerStats.total ?? 0);
        const todayCount = Number(leitnerStats.dueTodayCount ?? 0);
        const tomorrowCount = Number(leitnerStats.dueTomorrowCount ?? 0);
        const laterCount = Number(leitnerStats.dueLaterCount ?? 0);

        const nextDue = leitnerStats.nextDueInDays;
        const nextText =
            nextDue == null
                ? "—"
                : nextDue === 0
                    ? "heute"
                    : nextDue === 1
                        ? "morgen"
                        : `in ${nextDue} Tagen`;

        return { total, todayCount, tomorrowCount, laterCount, nextText };
    })();

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

    useEffect(() => {
        loadLeitnerStats();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
                    type: "vocab",
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
                    type: "vocab",
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

    async function loadCards(q?: string) {
        setStatus("Lade Karten...");
        const url =
            q && q.trim().length > 0
                ? `/api/cards?ownerKey=${encodeURIComponent(ownerKey)}&q=${encodeURIComponent(q)}&type=vocab`
                : `/api/cards?ownerKey=${encodeURIComponent(ownerKey)}&type=vocab`;

        const res = await fetch(url);

        const json = await res.json();

        if (!res.ok) {
            setStatus(json.error ?? "Aktion fehlgeschlagen.");
            return;
        }

        setCards(json.cards);
        setStatus(`Geladen ✅ (${json.cards.length})`);
        await loadLeitnerStats();
    }

    async function loadLeitnerStats() {
        const res = await fetch(
            `/api/learn/stats?ownerKey=${encodeURIComponent(ownerKey)}&type=vocab`,
            { cache: "no-store" }
        );
        const json = await res.json();
        if (!res.ok) return;

        setLeitnerStats(json);
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
                type: "vocab",
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
        const res = await fetch(
            `/api/learn/today?ownerKey=${encodeURIComponent(ownerKey)}&type=vocab`
        );
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

    async function logout() {
        const supabase = supabaseBrowser();
        await supabase.auth.signOut();
        window.location.href = "/login";
    }

    return (
        <main className="min-h-screen p-6 flex justify-center">
            <div className="w-full max-w-xl">
                <h1 className="text-3xl font-semibold">Swahili</h1>

                <div className="mt-3 flex items-center justify-between">
                    <div className="text-xs text-muted">
                        Eingeloggt als: <span className="font-mono">{userEmail ?? "..."}</span>
                    </div>
                    <button className="rounded-xl border px-3 py-2 text-sm" onClick={logout}>
                        Logout
                    </button>
                </div>

                <div className="mt-6 rounded-2xl border p-4">
                    <div className="text-sm font-medium">📊 Lernstand</div>

                    <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                        <div className="flex items-center justify-between">
                            <span className="text-muted">📅 Fällig heute</span>
                            <span className="font-semibold">{leitnerUi.todayCount}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-muted">🔁 Morgen dran</span>
                            <span className="font-semibold">{leitnerUi.tomorrowCount}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-muted">✅ Später</span>
                            <span className="font-semibold">{leitnerUi.laterCount}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-muted">📚 Gesamt</span>
                            <span className="font-semibold">{leitnerUi.total}</span>
                        </div>
                    </div>

                    <div className="mt-3 text-xs text-muted">
                        Nächstes Training: {leitnerUi.nextText}.
                    </div>
                </div>

                <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <button
                        onClick={() => router.push("/trainer")}
                        className="rounded-[32px] border p-8 text-left shadow-soft hover:shadow-warm transition"
                    >
                        <div className="text-xl font-semibold">Vokabeltrainer</div>
                        <div className="mt-2 text-sm text-muted">
                            Trainiere deine gespeicherten Karten (Leitner).
                        </div>
                    </button>

                    <button
                        onClick={() => router.push("/path")}
                        className="rounded-[32px] border p-8 text-left shadow-soft hover:shadow-warm transition"
                    >
                        <div className="text-xl font-semibold">Lernpfad</div>
                        <div className="mt-2 text-sm text-muted">
                            Kategorien von leicht bis schwer.
                        </div>
                    </button>

                    <button
                        onClick={() => router.push("/sentence-trainer")}
                        className="rounded-[32px] border p-8 text-left shadow-soft hover:shadow-warm transition"
                    >
                        <div className="text-xl font-semibold">Satztrainer</div>
                        <div className="mt-2 text-sm text-muted">
                            Baue Sätze aus deinem Wortschatz.
                        </div>
                    </button>
                </div>
            </div>
        </main>
    );
}
