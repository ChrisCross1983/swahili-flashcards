"use client";

import { useEffect } from "react";
import { installGlobalDiagnostics } from "@/lib/diagnostics/client";

export default function ClientDiagnosticsProvider() {
    useEffect(() => installGlobalDiagnostics(), []);
    return null;
}
