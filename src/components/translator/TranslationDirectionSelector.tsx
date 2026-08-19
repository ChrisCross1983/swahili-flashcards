import type { TranslationMode } from "@/lib/translator/types";

type Props = {
  mode: TranslationMode;
  disabled: boolean;
  onChange: (mode: TranslationMode) => void;
};

export default function TranslationDirectionSelector({
  mode,
  disabled,
  onChange,
}: Props) {
  return (
    <label className="block" htmlFor="translator-language-mode">
      <span className="mb-2 block text-xs font-semibold uppercase text-muted">
        Sprachmodus
      </span>
      <select
        id="translator-language-mode"
        className="min-h-14 w-full rounded-xl border border-strong bg-surface px-4 text-base font-semibold text-primary shadow-soft outline-none transition focus:border-success-strong focus:ring-2 focus:ring-[color:var(--accent-success)] disabled:opacity-60"
        value={mode}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as TranslationMode)}
      >
        <option value="auto">AUTO · Automatische Spracherkennung</option>
        <option value="de-to-sw">Deutsch → Kiswahili</option>
        <option value="sw-to-de">Kiswahili → Deutsch</option>
      </select>
    </label>
  );
}
