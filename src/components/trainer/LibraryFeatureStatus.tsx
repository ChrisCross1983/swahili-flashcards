import { SentenceFeatureIcon, type SentenceFeatureIconName } from "@/components/trainer/SentenceFormDisclosure";

export function LibraryFeatureStatus({ features }: { features: Array<{ icon: SentenceFeatureIconName; name: string; present: boolean; onActivate?: () => void }> }) {
    return <div className="library-feature-status" aria-label="Kartenfunktionen">
        {features.map(({ icon, name, present, onActivate }) => {
            const label = present ? `${name} vorhanden` : `Keine ${name}`;
            const className = `library-feature-status-icon ${present ? "is-present" : ""}`;
            return onActivate && present
                ? <button key={name} type="button" className={className} aria-label={`${label}, abspielen`} title={`${label} · abspielen`} onClick={onActivate}><SentenceFeatureIcon name={icon} className="h-4 w-4" /></button>
                : <span key={name} className={className} role="img" aria-label={label} title={label}><SentenceFeatureIcon name={icon} className="h-4 w-4" /></span>;
        })}
    </div>;
}
