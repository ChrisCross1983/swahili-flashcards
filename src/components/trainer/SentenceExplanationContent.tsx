import type { SentenceExplanation } from "@/lib/sentence/explanation";

export default function SentenceExplanationContent({ explanation }: { explanation: SentenceExplanation }) {
  return <div className="space-y-3 text-sm" data-testid="sentence-explanation-content">
    <h3 className="font-semibold text-primary">Satz verstehen</h3>
    <div className="space-y-2">
      {explanation.breakdown.map((part, index) => <div key={`${part.surface}-${index}`} className="rounded-xl border border-soft bg-surface px-3 py-2">
        <div className="font-semibold text-primary">{part.surface} <span className="font-normal text-muted">→ {part.meaning}</span></div>
        <p className="mt-1 text-muted">{part.explanation}</p>
      </div>)}
    </div>
    <p><span className="font-semibold">Natürlich:</span> {explanation.naturalTranslation}</p>
    {explanation.learningTip ? <p><span className="font-semibold">Merke:</span> {explanation.learningTip}</p> : null}
  </div>;
}
