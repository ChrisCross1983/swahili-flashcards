import type { ReactNode } from "react";

type Props = {
    children: ReactNode;
    className?: string;
    as?: "div" | "span" | "p";
};

export default function CardText({ children, className = "", as = "div" }: Props) {
    const Component = as;

    return (
        <Component
            className={`max-w-full min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] [hyphens:auto] ${className}`.trim()}
        >
            {children}
        </Component>
    );
}
