import Image from "next/image";

type Props = {
  canGenerate: boolean;
  loading: boolean;
  preview: string | null;
  error: string | null;
  onGenerate: () => void;
  onAccept: () => void;
  onDiscard: () => void;
};

export default function IllustrationControls({ canGenerate, loading, preview, error, onGenerate, onAccept, onDiscard }: Props) {
  return <div>
    <button type="button" className="mt-6 w-full rounded-xl border p-3" onClick={onGenerate} disabled={!canGenerate || loading}>
      {loading ? "Illustration wird erstellt …" : "Illustration erzeugen"}
    </button>
    {error ? <p role="alert" className="mt-2 text-sm text-accent-cta">{error}</p> : null}
    {preview ? <div className="mt-3 space-y-3">
      <Image src={preview} alt="Generierte Lernillustration zur Vorschau" width={1024} height={1024} unoptimized className="w-full max-h-56 object-contain rounded-2xl border bg-surface" />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={onAccept} disabled={loading}>Übernehmen</button>
        <button type="button" className="btn btn-secondary" onClick={onGenerate} disabled={loading}>Neu erzeugen</button>
        <button type="button" className="btn btn-ghost" onClick={onDiscard} disabled={loading}>Verwerfen</button>
      </div>
    </div> : null}
  </div>;
}
