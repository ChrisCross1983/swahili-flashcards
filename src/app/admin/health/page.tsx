import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import HealthClient from "./HealthClient";

export const dynamic = "force-dynamic";

function isPlaywrightHealthFixture() {
    return process.env.NODE_ENV === "development" &&
        process.env.PLAYWRIGHT_ADMIN_HEALTH_TEST === "1";
}

export default async function AdminHealthPage() {
    // This fixture is intentionally unavailable in every production build. API
    // routes retain their independent requireAdmin checks; Playwright mocks
    // their responses to exercise the rendered client UI.
    if (isPlaywrightHealthFixture()) {
        return <HealthClient currentAdminId="e2e-admin-fixture" />;
    }
    const auth = await requireAdmin();
    if (auth.response?.status === 401) redirect("/login");
    if (auth.response?.status === 403) notFound();
    if (auth.response) throw new Error("admin_check_unavailable");
    return <HealthClient currentAdminId={auth.user.id} />;
}
