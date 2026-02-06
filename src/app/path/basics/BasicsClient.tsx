"use client";

import { useMemo, useState } from "react";
import { useEffect } from "react";
import FullScreenSheet from "@/components/FullScreenSheet";
import { BASICS_PACK } from "@/lib/packs/basics";
import { useRouter } from "next/navigation";

function norm(s: string) {
  return s.trim().toLowerCase();
}
function keyOf(german: string, swahili: string) {
  return `${norm(german)}||${norm(swahili)}`;
}

type Props = {
  ownerKey: string;
};

export default function BasicsClient({ ownerKey }: Props) {
  const items = useMemo(() => BASICS_PACK, []);
  const total = items.length;

  const [open, setOpen] = useState(true);
  const [idx, setIdx] = useState(0);
  const [reveal, setReveal] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [addedCount, setAddedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [openAdjust, setOpenAdjust] = useState(false);
  const [draftGerman, setDraftGerman] = useState("");
  const [draftSwahili, setDraftSwahili] = useState("");
  const [saving, setSaving] = useState(false);

  const current = items[idx] ?? null;
  const router = useRouter();

  async function loadExisting() {
    setLoadingExisting(true);
    const res = await fetch(`/api/cards/all?ownerKey=${encodeURIComponent(ownerKey)}`);
    const json = await res.json();
    if (res.ok) {
      const set = new Set<string>(
        (json.cards ?? []).map((c: any) => keyOf(c.german_text, c.swahili_text))
      );
      setExisting(set);
    }
    setLoadingExisting(false);
  }

  function nextCard() {
    setReveal(false);
    setStatus(null);
    setIdx((x) => x + 1);
  }

  async function addToTrainerFinal(german: string, swahili: string) {
    setSaving(true);
    setStatus("Übernehme…");

    const res = await fetch("/api/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ownerKey,
        german,
        swahili,
        imagePath: null,
      }),
    });

    const json = await res.json();

    if (res.status === 409) {
      setStatus("Schon im Trainer vorhanden ✅");
      // existing Set updaten, damit UI sofort reagiert
      setExisting((prev) => {
        const next = new Set(prev);
        next.add(keyOf(german, swahili));
        return next;
      });
      setSaving(false);
      setOpenAdjust(false);
      nextCard();
      return;
    }

    if (!res.ok) {
      setStatus(json?.error ?? "Übernehmen fehlgeschlagen.");
      setSaving(false);
      return;
    }

    setStatus("In Trainer übernommen ✅");
    setAddedCount((x) => x + 1);
    setExisting((prev) => {
      const next = new Set(prev);
      next.add(keyOf(german, swahili));
      return next;
    });

    setSaving(false);
    setOpenAdjust(false);
    nextCard();
  }

  function skip() {
    setSkippedCount((x) => x + 1);
    nextCard();
  }

  useEffect(() => {
    loadExisting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finished = idx >= total;
  const currentKey = current ? keyOf(current.german, current.swahili) : "";
  const alreadyInTrainer = current ? existing.has(currentKey) : false;

  return (
    <>
      {/* Haupt-Sheet: Pack spielen */}
      <FullScreenSheet
        open={open}
        title="Lernpfad · Basics"
        onClose={() => router.push("/path")}
      >
        {finished ? (
          <div className="mt-2 rounded-2xl border p-4">
            <div className="text-lg font-semibold">Pack abgeschlossen ✅</div>
            <div className="mt-2 text-sm text-muted">
              Übernommen: <span className="font-medium">{addedCount}</span> ·
              Übersprungen: <span className="font-medium">{skippedCount}</span>
            </div>

            <div className="mt-4">
              <button
                className="w-full rounded-xl bg-accent-primary text-on-accent p-3"
                type="button"
                onClick={() => router.push("/path")}
              >
                Fertig
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="text-xs text-muted">
              Karte {idx + 1} / {total}
            </div>

            {alreadyInTrainer ? (
              <div className="mt-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
                ✅ Bereits im Trainer
              </div>
            ) : null}

            <div className="mt-3 rounded-2xl border p-4">
              <div className="text-lg font-semibold">{current?.german}</div>

              {reveal ? (
                <div className="mt-3 text-base text-primary">
                  <div>{current?.swahili}</div>
                  {current?.note ? (
                    <div className="mt-2 text-sm text-muted">{current.note}</div>
                  ) : null}
                </div>
              ) : (
                <button
                  className="mt-3 w-full rounded-xl border p-3"
                  type="button"
                  onClick={() => setReveal(true)}
                >
                  Lösung anzeigen
                </button>
              )}

              {status ? (
                <div className="mt-3 text-sm text-muted">{status}</div>
              ) : null}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                className="rounded-xl border p-3"
                type="button"
                onClick={skip}
              >
                Überspringen
              </button>

              <button
                className="rounded-xl bg-accent-primary text-on-accent p-3 disabled:opacity-60"
                type="button"
                onClick={() => {
                  if (!current) return;
                  setDraftGerman(current.german);
                  setDraftSwahili(current.swahili);
                  setOpenAdjust(true);
                }}
                disabled={!reveal || alreadyInTrainer || loadingExisting}
                title={!reveal ? "Bitte erst Lösung anzeigen" : ""}
              >
                {alreadyInTrainer ? "Schon übernommen" : "In Trainer übernehmen"}
              </button>
            </div>
          </>
        )}
      </FullScreenSheet>

      {/* Adjust-Sheet: Vor dem Übernehmen anpassen */}
      <FullScreenSheet
        open={openAdjust}
        title="Vor dem Übernehmen anpassen"
        onClose={() => setOpenAdjust(false)}
      >
        <div className="space-y-4">
          <div>
            {/* Enable multi-line entry for sentences/paragraphs. */}
            <label className="block text-sm font-medium">Deutsch</label>
            <textarea
              className="mt-1 w-full rounded-xl border p-3 whitespace-pre-wrap"
              value={draftGerman}
              onChange={(e) => setDraftGerman(e.target.value)}
              rows={3}
            />
          </div>

          <div>
            {/* Enable multi-line entry for sentences/paragraphs. */}
            <label className="block text-sm font-medium">Swahili</label>
            <textarea
              className="mt-1 w-full rounded-xl border p-3 whitespace-pre-wrap"
              value={draftSwahili}
              onChange={(e) => setDraftSwahili(e.target.value)}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              className="rounded-xl border p-3"
              type="button"
              onClick={() => setOpenAdjust(false)}
              disabled={saving}
            >
              Abbrechen
            </button>

            <button
              className="rounded-xl bg-accent-primary text-on-accent p-3 disabled:opacity-60"
              type="button"
              onClick={() => addToTrainerFinal(draftGerman, draftSwahili)}
              disabled={saving || !draftGerman.trim() || !draftSwahili.trim()}
            >
              {saving ? "Speichere…" : "Übernehmen"}
            </button>
          </div>

          {status ? <div className="text-sm text-muted">{status}</div> : null}
        </div>
      </FullScreenSheet>
    </>
  );
}
