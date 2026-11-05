import type { ReactNode, Ref } from "react";

export type SentenceFeatureIconName = "grammar" | "notes" | "group" | "audio" | "image" | "swap";

const iconPaths: Record<SentenceFeatureIconName, ReactNode> = {
    grammar: <><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /><path d="m12 7 1.3 3.7L17 12l-3.7 1.3L12 17l-1.3-3.7L7 12l3.7-1.3L12 7Z" /></>,
    notes: <><path d="M5 4.5h11a2 2 0 0 1 2 2V20H7a2 2 0 0 1-2-2V4.5Z" /><path d="M8 9h7M8 12h7M8 15h5" /><path d="M18 8h1a1 1 0 0 1 1 1v11" /></>,
    group: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19v-1.5A4.5 4.5 0 0 1 8 13h2a4.5 4.5 0 0 1 4.5 4.5V19H3.5ZM16 5.2a3 3 0 0 1 0 5.6M17 13.2a4.5 4.5 0 0 1 3.5 4.3V19h-3" /></>,
    audio: <><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v4m-4 0h8" /></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m4 17 4.5-4.5 3 3L15 12l5 5" /></>,
    swap: <><path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4" /></>,
};

export function SentenceFeatureIcon({ name, className = "" }: { name: SentenceFeatureIconName; className?: string }) {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{iconPaths[name]}</svg>;
}

export function SentenceFormGroup({ sentence, children }: { sentence: boolean; children: ReactNode }) {
    if (!sentence) return <>{children}</>;
    return <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="sentence-feature-grid">{children}</div>;
}

export default function SentenceFormDisclosure({ sentence, title, status, badge, description, icon, featured = false, open, onToggle, coachmark, sectionRef, triggerRef, children }: {
    sentence: boolean;
    title: string;
    status?: ReactNode;
    badge?: string;
    description?: string;
    icon?: SentenceFeatureIconName;
    featured?: boolean;
    open: boolean;
    onToggle: () => void;
    coachmark?: ReactNode;
    sectionRef?: Ref<HTMLElement>;
    triggerRef?: Ref<HTMLButtonElement>;
    children: ReactNode;
}) {
    if (!sentence) return <>{children}</>;
    return <section ref={sectionRef} className={`sentence-feature-card ${featured ? "sentence-feature-card--featured sm:col-span-2" : open ? "sm:col-span-2" : ""} ${open ? "is-open" : ""}`}>
        <button ref={triggerRef} type="button" className="sentence-feature-trigger" aria-expanded={open} onClick={onToggle}>
            <span className="sentence-feature-icon"><SentenceFeatureIcon name={icon ?? "notes"} className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1 text-left">
                <span className="flex flex-wrap items-center gap-2">
                    <span className="sentence-feature-title">{title}</span>
                    {badge ? <span className="sentence-feature-badge"><span className="sentence-feature-dot" />{badge}</span> : null}
                </span>
                {description ? <span className="sentence-feature-description">{description}</span> : null}
                {status ? <span className="sentence-feature-status">{status}</span> : null}
            </span>
            <svg className="sentence-feature-chevron h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 4 6 6-6 6" /></svg>
        </button>
        {coachmark && !open ? coachmark : null}
        <div className={`sentence-feature-body ${open ? "is-open" : ""}`} aria-hidden={!open} inert={!open}>
            <div className="sentence-feature-panel">{children}</div>
        </div>
    </section>;
}
