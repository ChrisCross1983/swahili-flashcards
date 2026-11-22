import styles from "./TrainerSessionTransition.module.css";
import Image from "next/image";

export default function TrainerSessionTransition() {
    return (
        <div
            className="mt-4 flex min-h-[55dvh] items-center justify-center rounded-2xl border border-soft bg-surface p-6 text-center shadow-soft"
            role="status"
            aria-live="polite"
        >
            <div className="flex max-w-xs flex-col items-center">
                <div className={styles.emblem} aria-hidden="true">
                    <Image src="/trainer-lion-editorial.webp" width={520} height={520} alt="" unoptimized className={styles.lion} />
                </div>
                <div className="mt-5 text-base font-semibold text-primary">Lernkarten werden vorbereitet …</div>
                <div className="mt-2 h-1 w-12 overflow-hidden rounded-full bg-surface-strong" aria-hidden="true"><span className={styles.progress} /></div>
            </div>
        </div>
    );
}
