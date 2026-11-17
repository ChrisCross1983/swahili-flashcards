import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import HealthClient from "./HealthClient";

export const dynamic = "force-dynamic";

export default async function AdminHealthPage() {
    const auth = await requireAdmin();
    if (auth.response?.status === 401) redirect("/login");
    if (auth.response?.status === 403) notFound();
    if (auth.response) throw new Error("admin_check_unavailable");
    return <HealthClient currentAdminId={auth.user.id} />;
}
