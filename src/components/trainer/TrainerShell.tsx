import type { ReactNode } from "react";

export default function TrainerShell({ children }: { children: ReactNode }) {
    return <div className="space-y-4">{children}</div>;
}
