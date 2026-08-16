import type { ReactNode } from "react";

type AppRouteStateProps = {
    eyebrow?: string;
    title: string;
    description: string;
    children?: ReactNode;
};

export default function AppRouteState({
    eyebrow = "Swahili",
    title,
    description,
    children,
}: AppRouteStateProps) {
    return (
        <main className="flex min-h-screen items-center justify-center bg-base p-6">
            <section className="w-full max-w-xl rounded-3xl border border-soft bg-surface p-6 shadow-warm sm:p-8">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-cta">{eyebrow}</div>
                <h1 className="mt-3 text-2xl font-semibold tracking-tight text-primary sm:text-3xl">{title}</h1>
                <p className="mt-3 text-sm leading-6 text-muted sm:text-base">{description}</p>
                {children ? <div className="mt-6 flex flex-col gap-3 sm:flex-row">{children}</div> : null}
            </section>
        </main>
    );
}
