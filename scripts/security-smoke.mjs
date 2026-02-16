#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadDotEnvLocal() {
    const envPath = path.resolve(process.cwd(), ".env.local");
    if (!fs.existsSync(envPath)) return;

    const content = fs.readFileSync(envPath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;

        const index = line.indexOf("=");
        if (index <= 0) continue;

        const key = line.slice(0, index).trim();
        const value = line.slice(index + 1).trim().replace(/^['\"]|['\"]$/g, "");

        if (!process.env[key]) {
            process.env[key] = value;
        }
    }
}

function mustEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required env: ${name}`);
    }
    return value;
}

function parseSetCookies(headers) {
    const values = typeof headers.getSetCookie === "function"
        ? headers.getSetCookie()
        : (headers.get("set-cookie") ? [headers.get("set-cookie")] : []);

    const cookiePairs = [];
    for (const value of values) {
        if (!value) continue;
        const first = value.split(";", 1)[0];
        if (first.includes("=")) cookiePairs.push(first);
    }

    return cookiePairs.join("; ");
}

async function run() {
    loadDotEnvLocal();

    const supabaseUrl = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseAnon = mustEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const email = mustEnv("SECURITY_TEST_EMAIL");
    const password = mustEnv("SECURITY_TEST_PASSWORD");
    const baseUrl = process.env.SECURITY_BASE_URL || "http://localhost:3000";

    const supabase = createClient(supabaseUrl, supabaseAnon);
    const signIn = await supabase.auth.signInWithPassword({ email, password });
    if (signIn.error || !signIn.data.user) {
        throw new Error(`Supabase sign-in failed: ${signIn.error?.message ?? "unknown"}`);
    }

    const loginResponse = await fetch(`${baseUrl}/api/dev/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
    });

    if (!loginResponse.ok) {
        throw new Error(`DEV login route failed: HTTP ${loginResponse.status}`);
    }

    const authCookieHeader = parseSetCookies(loginResponse.headers);
    if (!authCookieHeader) {
        throw new Error("No auth cookies received from /api/dev/login");
    }

    const endpoints = [
        "/api/stats/overview?type=vocab",
        "/api/learn/today?type=vocab",
        "/api/cards?type=vocab",
    ];

    const checks = [
        { name: "unauthenticated", endpointSuffix: "", cookie: null, expected: 401 },
        { name: "authenticated", endpointSuffix: "", cookie: authCookieHeader, expected: 200 },
        { name: "ownerKey-ignored", endpointSuffix: "&ownerKey=not-my-id", cookie: authCookieHeader, expected: 200 },
    ];

    let failures = 0;

    for (const endpoint of endpoints) {
        for (const check of checks) {
            const url = `${baseUrl}${endpoint}${check.endpointSuffix}`;

            const headers = {};
            if (check.cookie) {
                headers.cookie = check.cookie;
            }

            const response = await fetch(url, { method: "GET", headers });
            const pass = response.status === check.expected;
            if (!pass) failures += 1;

            console.log(
                `[${pass ? "PASS" : "FAIL"}] ${endpoint}${check.endpointSuffix} | ${check.name} | expected ${check.expected}, got ${response.status}`
            );
        }
    }

    if (failures === 0) {
        console.log("ALL PASS");
        process.exit(0);
    }

    console.error(`FAILED: ${failures}`);
    process.exit(1);
}

run().catch((error) => {
    console.error(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
});
