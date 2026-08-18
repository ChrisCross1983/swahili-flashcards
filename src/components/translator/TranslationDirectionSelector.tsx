import type { TranslationDirection } from "@/lib/translator/types";
import { TRANSLATION_DIRECTIONS } from "@/lib/translator/stateMachine";

type Props = {
  direction: TranslationDirection;
  disabled: boolean;
  onChange: (direction: TranslationDirection) => void;
};

function isSelected(
  direction: TranslationDirection,
  sourceLanguage: TranslationDirection["sourceLanguage"],
) {
  return direction.sourceLanguage === sourceLanguage;
}

export default function TranslationDirectionSelector({
  direction,
  disabled,
  onChange,
}: Props) {
  return (
    <fieldset className="grid grid-cols-2 gap-1 rounded-2xl border border-soft bg-surface p-1.5">
      <legend className="sr-only">Übersetzungsrichtung</legend>
      <button
        type="button"
        className={`min-h-14 rounded-xl border px-2 py-3 text-center text-xs font-semibold uppercase transition sm:text-sm ${
          isSelected(direction, "sw")
            ? "border-success-strong bg-accent-success text-on-accent shadow-soft"
            : "border-transparent text-muted"
        }`}
        aria-pressed={isSelected(direction, "sw")}
        disabled={disabled}
        onClick={() => onChange(TRANSLATION_DIRECTIONS.swToDe)}
      >
        Kiswahili → Deutsch
      </button>
      <button
        type="button"
        className={`min-h-14 rounded-xl border px-2 py-3 text-center text-xs font-semibold uppercase transition sm:text-sm ${
          isSelected(direction, "de")
            ? "border-success-strong bg-accent-success text-on-accent shadow-soft"
            : "border-transparent text-muted"
        }`}
        aria-pressed={isSelected(direction, "de")}
        disabled={disabled}
        onClick={() => onChange(TRANSLATION_DIRECTIONS.deToSw)}
      >
        Deutsch → Kiswahili
      </button>
    </fieldset>
  );
}
