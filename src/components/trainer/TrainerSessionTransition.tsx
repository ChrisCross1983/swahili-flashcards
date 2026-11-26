"use client";

import styles from "./TrainerSessionTransition.module.css";
import Image from "next/image";
import { useEffect, useState } from "react";

export default function TrainerSessionTransition({ introSoundEnabled, onToggleIntroSound, showSoundControl = true }: {
    introSoundEnabled: boolean;
    onToggleIntroSound: () => void;
    showSoundControl?: boolean;
}) {
    const [useAnimatedLion, setUseAnimatedLion] = useState(false);
    const [animationUnavailable, setAnimationUnavailable] = useState(false);

    useEffect(() => {
        const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
        if (!motionQuery) return;

        const syncMotionPreference = () => setUseAnimatedLion(!motionQuery.matches);
        syncMotionPreference();
        motionQuery.addEventListener?.("change", syncMotionPreference);
        return () => motionQuery.removeEventListener?.("change", syncMotionPreference);
    }, []);

    const showAnimatedLion = useAnimatedLion && !animationUnavailable;

    return (
        <div
            className="mt-4 flex min-h-[55dvh] items-center justify-center rounded-2xl border border-soft bg-surface p-6 text-center shadow-soft"
            role="status"
            aria-live="polite"
        >
            <div className="relative flex max-w-xs flex-col items-center">
                {showSoundControl ? <button
                    type="button"
                    className="absolute right-0 top-0 inline-flex h-11 min-w-11 items-center justify-center rounded-full border border-soft bg-surface-elevated px-3 text-xs font-medium text-muted transition hover:border-strong hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-primary)]"
                    aria-label={introSoundEnabled ? "Intro-Ton stummschalten" : "Intro-Ton einschalten"}
                    aria-pressed={introSoundEnabled}
                    onClick={onToggleIntroSound}
                >
                    <span aria-hidden="true">{introSoundEnabled ? "🔊" : "🔇"}</span>
                    <span className="sr-only">Intro-Ton</span>
                </button> : null}
                <div className={styles.emblem} aria-hidden="true">
                    <Image
                        key={showAnimatedLion ? "trainer-lion-intro" : "trainer-lion-editorial"}
                        src={showAnimatedLion ? "/trainer-lion-intro.webp" : "/trainer-lion-editorial.webp"}
                        width={showAnimatedLion ? 418 : 520}
                        height={showAnimatedLion ? 627 : 476}
                        alt=""
                        unoptimized
                        className={styles.lion}
                        onError={() => setAnimationUnavailable(true)}
                    />
                </div>
                <div className="mt-5 text-base font-semibold text-primary">Deine Lernrunde beginnt …</div>
                <div className="mt-2 h-1 w-12 overflow-hidden rounded-full bg-surface-strong" aria-hidden="true"><span className={styles.progress} /></div>
            </div>
        </div>
    );
}
