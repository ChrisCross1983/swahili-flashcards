import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/" }));
import HomeClient from "./HomeClient";

describe("Home navigation", () => {
    it("shows Health Center only when the server supplied active admin membership", () => {
        const normal = renderToStaticMarkup(<HomeClient ownerKey="test-user" isAdmin={false} />);
        const admin = renderToStaticMarkup(<HomeClient ownerKey="test-user" isAdmin />);
        expect(normal).not.toContain("Health Center");
        expect(normal).not.toContain("/admin/health");
        expect(admin).toContain('href="/admin/health"');
        expect(admin).toContain("Health Center");
    });
});
