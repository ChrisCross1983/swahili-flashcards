type Props = {
    mode: "leitner" | "ai";
    onChange: (mode: "leitner" | "ai") => void;
};

export default function ModeSwitch({ mode, onChange }: Props) {
    return (
        <div className="mt-4 inline-flex rounded-2xl border border-soft bg-surface p-1">
            <button
                type="button"
                className={`btn btn-ghost text-sm ${mode === "leitner" ? "bg-surface-elevated" : ""}`}
                onClick={() => onChange("leitner")}
            >
                Leitner
            </button>
            <button
                type="button"
                className={`btn btn-ghost text-sm ${mode === "ai" ? "bg-surface-elevated" : ""}`}
                onClick={() => onChange("ai")}
            >
                KI-Trainer
            </button>
        </div>
    );
}
