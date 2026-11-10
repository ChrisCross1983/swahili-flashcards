import Image from "next/image";
import { SentenceFeatureIcon } from "./SentenceFormDisclosure";

type Props = {
  canGenerate: boolean;
  loading: boolean;
  preview: string | null;
  error: string | null;
  currentImageUrl?: string | null;
  selectedImageUrl?: string | null;
  selectedImagePending?: boolean;
  uploadHint?: string;
  cooldownSeconds?: number;
  uploadInputId?: string;
  onGenerate: () => void;
  onAccept: () => void;
  onDiscard: () => void;
};

const waitLabel = (seconds: number) => seconds >= 3600
  ? `In etwa ${Math.ceil(seconds / 3600)} Std. erneut versuchen.`
  : seconds >= 60
    ? `In etwa ${Math.ceil(seconds / 60)} Min. erneut versuchen.`
    : `In ${seconds} Sek. erneut versuchen.`;

export default function IllustrationControls({
  canGenerate, loading, preview, error, currentImageUrl = null, selectedImageUrl = null, uploadHint,
  selectedImagePending = false, cooldownSeconds = 0, uploadInputId = "trainer-card-image-upload",
  onGenerate, onAccept, onDiscard,
}: Props) {
  const selectedVisible = selectedImagePending && Boolean(selectedImageUrl);
  const referenceImage = selectedImagePending ? selectedImageUrl : currentImageUrl;
  const referenceLabel = selectedImagePending ? "Neues Bild ausgewählt" : "Aktuelles Bild";
  const canRequest = canGenerate && !loading && cooldownSeconds <= 0;
  const generateLabel = currentImageUrl || selectedImagePending ? "Illustration neu erzeugen" : "Illustration erzeugen";

  return <div className="illustration-card">
    <div className="mb-4 flex items-start gap-3">
      <span className="sentence-feature-icon" aria-hidden="true"><SentenceFeatureIcon name="image" className="h-5 w-5" /></span>
      <div><h3 className="text-sm font-bold text-primary">AI-Illustration</h3><p className="mt-1 text-xs leading-relaxed text-muted">Erstelle automatisch ein passendes Lernbild für dieses Wort.</p></div>
    </div>

    {referenceImage ? <div className={preview ? "illustration-reference illustration-reference--compact" : "illustration-reference"}>
      <p className="mb-2 text-xs font-semibold text-muted">{referenceLabel}</p>
      <Image src={referenceImage} alt={referenceLabel} width={1024} height={1024} unoptimized className="illustration-reference-image" />
      {selectedVisible ? <p className="mt-2 text-xs font-medium text-muted">Noch nicht gespeichert. Speichere die Karte, um das neue Bild zu übernehmen.</p> : null}
    </div> : selectedImagePending ? <p className="text-sm font-medium text-muted">Neues Bild ausgewählt · noch nicht gespeichert</p> : null}

    {preview ? <div className="illustration-new-preview mt-4 space-y-3" data-testid="illustration-preview">
      <div><p className="text-sm font-bold">Neue Vorschau</p><p className="text-xs text-muted">Noch nicht gespeichert</p></div>
      <Image src={preview} alt="Neue AI-Illustration zur Vorschau" width={1024} height={1024} unoptimized className="illustration-preview-image" />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary min-h-11" onClick={onAccept} disabled={loading}>Übernehmen</button>
        <button type="button" className="btn btn-secondary min-h-11" onClick={onGenerate} disabled={!canRequest}>Neu erzeugen</button>
        <button type="button" className="btn btn-ghost min-h-11" onClick={onDiscard} disabled={loading}>Verwerfen</button>
      </div>
    </div> : <div className="mt-4">
      {loading ? <div className="illustration-skeleton" role="status" aria-live="polite"><span>Illustration wird erstellt …<small className="mt-1 block">Das kann einige Sekunden dauern.</small></span></div> : null}
      {!error ? <button type="button" className="btn btn-primary min-h-12 w-full justify-center gap-2" onClick={onGenerate} disabled={!canRequest}>
        <SentenceFeatureIcon name="grammar" className="h-5 w-5" />
        {loading ? "Illustration wird erstellt …" : generateLabel}
      </button> : null}
      {!canGenerate && !loading ? <p className="mt-2 text-xs text-muted">Gib zuerst beide Wörter ein.</p> : null}
    </div>}

    {error ? <div role="alert" className="illustration-error mt-3">
      <p className="font-semibold">{error}</p>
      {cooldownSeconds > 0 ? <p className="mt-1">{waitLabel(cooldownSeconds)}</p> : <p className="mt-1">Versuche es erneut oder verwende alternativ ein eigenes Bild.</p>}
      {!preview ? <button type="button" className="btn btn-secondary mt-3 min-h-11" onClick={onGenerate} disabled={!canRequest}>Erneut versuchen</button> : null}
    </div> : cooldownSeconds > 0 ? <p className="mt-3 text-xs text-muted" role="status">{waitLabel(cooldownSeconds)}</p> : null}

    <div className="illustration-upload mt-4">
      <p className="text-xs text-muted">Alternativ kannst du ein eigenes Bild hochladen.</p>
      {uploadHint ? <p className="mt-1 text-xs text-muted">{uploadHint}</p> : null}
      <label htmlFor={uploadInputId} className="btn btn-secondary mt-2 inline-flex min-h-11 cursor-pointer items-center gap-2">
        <SentenceFeatureIcon name="image" className="h-4 w-4" />Eigenes Bild verwenden
      </label>
    </div>
  </div>;
}
