import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
        include: ["src/**/*.{test,spec}.{ts,tsx}"],
        exclude: ["e2e/**", "node_modules/**", ".next/**"],
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
});
