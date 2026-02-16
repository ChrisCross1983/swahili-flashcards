import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function POST(req: Request) {
    if (process.env.NODE_ENV !== "development") {
        return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }

    const { email, password } = (await req.json()) as {
        email?: string;
        password?: string;
    };

    if (!email || !password) {
        return NextResponse.json(
            { error: "email and password are required" },
            { status: 400 }
        );
    }

    const response = NextResponse.json({ ok: true });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return [];
                },
                setAll(cookies) {
                    for (const cookie of cookies) {
                        response.cookies.set(cookie.name, cookie.value, cookie.options);
                    }
                },
            },
        }
    );

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error || !data.user) {
        return NextResponse.json(
            { error: error?.message ?? "Login failed" },
            { status: 401 }
        );
    }

    return response;
}
