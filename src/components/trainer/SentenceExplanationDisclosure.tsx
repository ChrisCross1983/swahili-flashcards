import type { SentenceExplanation } from "@/lib/sentence/explanation";
import SentenceExplanationContent from "./SentenceExplanationContent";

export default function SentenceExplanationDisclosure({ explanation, open, onToggle }: {
  explanation: SentenceExplanation;
  open: boolean;
  onToggle: () => void;
}) {
  return <div className="rounded-2xl border border-soft bg-surface p-3">
    <button type="button" className="w-full text-left text-sm font-medium" aria-expanded={open} aria-controls="sentence-explanation-content" onClick={onToggle}>
      🧠 Warum heißt das so?
    </button>
    {open ? <div id="sentence-explanation-content" className="mt-3"><SentenceExplanationContent explanation={explanation} /></div> : null}
  </div>;
}
