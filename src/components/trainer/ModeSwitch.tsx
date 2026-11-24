type Props = {
    mode: "leitner" | "ai";
    onChange: (mode: "leitner" | "ai") => void;
};

export default function ModeSwitch({ mode, onChange }: Props) {
    return (
        <div className="inline-flex rounded-xl border border-soft bg-surface-elevated p-1 shadow-soft" role="group" aria-label="Trainermodus">
            <button
                type="button"
                className={`btn min-h-10 rounded-lg px-4 text-sm ${mode === "leitner" ? "bg-surface text-primary shadow-soft" : "btn-ghost text-muted"}`}
                aria-pressed={mode === "leitner"}
                onClick={() => onChange("leitner")}
            >
                Leitner
            </button>
            <button
                type="button"
                className={`btn min-h-10 rounded-lg px-4 text-sm ${mode === "ai" ? "bg-surface text-primary shadow-soft" : "btn-ghost text-muted"}`}
                aria-pressed={mode === "ai"}
                onClick={() => onChange("ai")}
            >
                KI-Trainer
            </button>
        </div>
    );
}
